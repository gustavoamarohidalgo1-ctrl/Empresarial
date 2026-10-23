package pe.edu.utp.sigasp.identidad.interno;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextHolderFilter;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.CrossOriginOpenerPolicyHeaderWriter.CrossOriginOpenerPolicy;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.util.matcher.RequestMatcher;

import pe.edu.utp.sigasp.compartido.seguridad.Rol;
import pe.edu.utp.sigasp.compartido.web.PoliticaContenidoHtml;
import pe.edu.utp.sigasp.compartido.web.RutasWeb;

/**
 * Seguridad de la API y del SPA empaquetado.
 * <ul>
 *   <li>Sesión de servidor (cookie HttpOnly): cerrar sesión la invalida en el servidor (HU01).</li>
 *   <li>CSRF con cookie legible para SPA y cabecera X-XSRF-TOKEN.</li>
 *   <li>Todo lo que no está declarado se deniega (lista blanca). Las únicas rutas públicas fuera
 *       de la API son los GET de archivos del build y de navegación del SPA ({@link RutasWeb}).</li>
 *   <li>Las rutas {@code /api/v1/dev/**} solo existen en desarrollo: las que no están habilitadas responden 404 a
 *       cualquiera, antes de CSRF y de la autorización ({@link RutasDesarrolloInexistentes}).</li>
 *   <li>La propiedad de cada cita se verifica además en los servicios: el rol no basta.</li>
 *   <li>Cabeceras: CSP estricta solo en HTML, Permissions-Policy mínima, COOP same-origin,
 *       Referrer-Policy no-referrer y X-Frame-Options DENY.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
class SeguridadConfig {

    static final String COOKIE_SESION = "SIGASP_SESSION";

    /** Ninguna capacidad sensible del navegador: la aplicación no usa cámara, ubicación ni pagos. */
    static final String PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), "
            + "browsing-topics=()";

    @Bean
    PasswordEncoder passwordEncoder() {
        // BCrypt con sal por defecto; el prefijo {bcrypt} permite migrar de algoritmo sin romper hashes.
        // Las contraseñas de más de 72 bytes (la política admite 128 caracteres) usan {bcrypt-sha256}.
        return new CodificadorContrasenas();
    }

    @Bean
    AuthenticationManager authenticationManager(UsuarioDetallesService usuarios, PasswordEncoder encoder) {
        DaoAuthenticationProvider proveedor = new DaoAuthenticationProvider(usuarios);
        proveedor.setPasswordEncoder(encoder);
        return new ProviderManager(proveedor);
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    SecurityFilterChain api(HttpSecurity http, RespuestasSeguridad respuestas,
            SecurityContextRepository contextos, AuditoriaLogout auditoriaLogout, PoliticaContenidoHtml csp,
            RegistroCredenciales credenciales,
            @Value("${springdoc.api-docs.enabled:false}") boolean documentacionPublica,
            @Value("${sigasp.reloj.ajustable:false}") boolean relojAjustable,
            @Value("${sigasp.dev.buzon-correos:false}") boolean buzonCorreosPublico) throws Exception {
        RequestMatcher recursosEstaticos = RutasWeb::esRecursoEstatico;
        RequestMatcher navegacionSpa = RutasWeb::esNavegacionSpa;
        http
                // Token en cookie legible (XSRF-TOKEN) y en la cabecera X-XSRF-TOKEN, sin enmascarar:
                // solo aparece en GET /auth/csrf, que no refleja datos del cliente (el index.html del
                // SPA es estático y no lo lleva), así que la compresión no lo expone a BREACH. Así el
                // valor de GET /auth/csrf coincide con el de la cookie para cualquier cliente.
                .csrf(csrf -> csrf
                        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .securityContext(contexto -> contexto.securityContextRepository(contextos))
                // /api/v1/dev/** no habilitadas (todas en producción): 404 para todos, antes de CSRF y del rol.
                .addFilterBefore(new RutasDesarrolloInexistentes(relojAjustable, buzonCorreosPublico, respuestas),
                        CsrfFilter.class)
                // Una sesión iniciada antes del último cambio de contraseña deja de valer (v1.1).
                .addFilterAfter(new RevalidacionSesion(credenciales), SecurityContextHolderFilter.class)
                .sessionManagement(sesion -> sesion.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .headers(cabeceras -> cabeceras
                        .referrerPolicy(r -> r.policy(ReferrerPolicy.NO_REFERRER))
                        .frameOptions(f -> f.deny())
                        .permissionsPolicyHeader(p -> p.policy(PERMISSIONS_POLICY))
                        .crossOriginOpenerPolicy(c -> c.policy(CrossOriginOpenerPolicy.SAME_ORIGIN))
                        // Se escribe al confirmar la respuesta, cuando ya se conoce su Content-Type.
                        .addHeaderWriter(csp))
                .authorizeHttpRequests(rutas -> {
                    rutas.requestMatchers(HttpMethod.GET, "/api/v1/auth/csrf", "/api/v1/auth/sesion",
                                    "/api/v1/sistema/info").permitAll()
                            .requestMatchers(HttpMethod.POST, "/api/v1/auth/login", "/api/v1/auth/registro",
                                    "/api/v1/auth/recuperacion", "/api/v1/auth/restablecer").permitAll();
                    if (buzonCorreosPublico) {
                        // Solo perfil dev: buzón del correo simulado para completar la recuperación en local.
                        rutas.requestMatchers(HttpMethod.GET, "/api/v1/dev/correos").permitAll();
                    }
                    rutas
                            .requestMatchers("/actuator/health", "/actuator/health/**", "/actuator/info").permitAll()
                            .requestMatchers("/api/v1/pacientes/me/**").hasRole(Rol.PACIENTE.name())
                            .requestMatchers("/api/v1/operador/**").hasRole(Rol.OPERADOR.name())
                            // Reloj simulado (solo con sigasp.reloj.ajustable=true; si no, el filtro ya respondió 404).
                            .requestMatchers("/api/v1/dev/**").hasRole(Rol.ADMINISTRADOR.name())
                            .requestMatchers("/api/v1/analitica/**")
                            .hasAnyRole(Rol.RESPONSABLE.name(), Rol.ADMINISTRADOR.name())
                            .requestMatchers("/api/v1/admin/**").hasRole(Rol.ADMINISTRADOR.name())
                            .requestMatchers("/api/v1/cuenta/**").authenticated()
                            .requestMatchers("/api/v1/catalogos/**", "/api/v1/operaciones/**").authenticated();
                    if (documentacionPublica) {
                        rutas.requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll();
                    }
                    // Jar único: archivos del build de Angular y rutas del SPA (reenviadas a index.html).
                    // Excluyen /api, /actuator y la documentación, que conservan sus propias reglas.
                    rutas.requestMatchers(recursosEstaticos, navegacionSpa).permitAll();
                    rutas.anyRequest().denyAll();
                })
                .exceptionHandling(errores -> errores
                        .authenticationEntryPoint(respuestas)
                        .accessDeniedHandler(respuestas))
                .logout(salida -> salida
                        .logoutUrl("/api/v1/auth/logout")
                        .addLogoutHandler(auditoriaLogout)
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies(COOKIE_SESION)
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)));
        return http.build();
    }
}
