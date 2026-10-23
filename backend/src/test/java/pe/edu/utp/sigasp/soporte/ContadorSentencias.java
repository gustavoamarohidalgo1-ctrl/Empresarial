package pe.edu.utp.sigasp.soporte;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Supplier;

import javax.sql.DataSource;

import org.aopalliance.intercept.MethodInterceptor;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.stereotype.Component;

/**
 * Cuenta las sentencias SQL que ejecuta el hilo actual, sea por Hibernate o por JDBC
 * ({@code JdbcClient}). Envuelve el {@link DataSource} del contexto de pruebas: cada
 * {@code prepareStatement}, {@code prepareCall} o {@code createStatement} de una conexión cuenta
 * como una sentencia. Fuera de {@link #medir} no hace nada más que delegar.
 */
@Component
public class ContadorSentencias implements BeanPostProcessor {

    private static final Set<String> CREAN_SENTENCIA = Set.of("prepareStatement", "prepareCall", "createStatement");
    private static final ThreadLocal<List<String>> SENTENCIAS = new ThreadLocal<>();

    /** Resultado de una medición: las sentencias ejecutadas y el valor devuelto. */
    public record Medicion<T>(T valor, List<String> sentencias) {

        public int total() {
            return sentencias.size();
        }

        /** Las sentencias numeradas, para el mensaje de una aserción fallida. */
        public String detalle() {
            StringBuilder texto = new StringBuilder();
            for (int i = 0; i < sentencias.size(); i++) {
                texto.append(System.lineSeparator()).append(i + 1).append(". ")
                        .append(sentencias.get(i).replaceAll("\\s+", " "));
            }
            return texto.toString();
        }
    }

    /** Ejecuta la acción en este hilo y devuelve las sentencias SQL que produjo. */
    public static <T> Medicion<T> medir(Supplier<T> accion) {
        List<String> anteriores = SENTENCIAS.get();
        List<String> sentencias = new ArrayList<>();
        SENTENCIAS.set(sentencias);
        try {
            return new Medicion<>(accion.get(), List.copyOf(sentencias));
        } finally {
            SENTENCIAS.set(anteriores);
        }
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String nombre) {
        if (!(bean instanceof DataSource)) {
            return bean;
        }
        // Proxy de clase: conserva el tipo concreto (HikariDataSource) para quien lo necesite.
        ProxyFactory fabrica = new ProxyFactory(bean);
        fabrica.setProxyTargetClass(true);
        fabrica.addAdvice((MethodInterceptor) invocacion -> {
            Object resultado = invocacion.proceed();
            return resultado instanceof Connection conexion
                    && "getConnection".equals(invocacion.getMethod().getName())
                    ? contando(conexion)
                    : resultado;
        });
        return fabrica.getProxy();
    }

    private static Connection contando(Connection conexion) {
        InvocationHandler manejador = (proxy, metodo, argumentos) -> {
            switch (metodo.getName()) {
                case "equals" -> {
                    return proxy == argumentos[0];
                }
                case "hashCode" -> {
                    return System.identityHashCode(proxy);
                }
                default -> registrar(metodo, argumentos);
            }
            try {
                return metodo.invoke(conexion, argumentos);
            } catch (InvocationTargetException ex) {
                throw ex.getCause();
            }
        };
        return (Connection) Proxy.newProxyInstance(ContadorSentencias.class.getClassLoader(),
                new Class<?>[] {Connection.class}, manejador);
    }

    private static void registrar(Method metodo, Object[] argumentos) {
        List<String> sentencias = SENTENCIAS.get();
        if (sentencias != null && CREAN_SENTENCIA.contains(metodo.getName())) {
            sentencias.add(argumentos != null && argumentos.length > 0 && argumentos[0] instanceof String sql
                    ? sql
                    : metodo.getName() + "()");
        }
    }
}
