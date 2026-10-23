package pe.edu.utp.sigasp.compartido.error;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.MDC;
import org.springframework.http.ProblemDetail;

import pe.edu.utp.sigasp.compartido.web.RequestIdFilter;

/** Construye respuestas Problem Details (RFC 9457) homogéneas para toda la API. */
public final class Problemas {

    public static final String BASE_TIPO = "https://siga-sp.local/errores/";

    private Problemas() {
    }

    public static ProblemDetail crear(CodigoError codigo, String detalle, String instancia) {
        ProblemDetail problema = ProblemDetail.forStatusAndDetail(codigo.estado(), detalle);
        problema.setType(URI.create(BASE_TIPO + codigo.slug()));
        problema.setTitle(codigo.titulo());
        if (instancia != null) {
            problema.setInstance(URI.create(instancia));
        }
        problema.setProperty("codigo", codigo.name());
        String requestId = MDC.get(RequestIdFilter.MDC_CLAVE);
        if (requestId != null) {
            problema.setProperty("requestId", requestId);
        }
        return problema;
    }

    public static ProblemDetail validacion(List<ErrorCampo> errores, String instancia) {
        ProblemDetail problema = crear(CodigoError.VALIDACION, CodigoError.VALIDACION.detallePorDefecto(), instancia);
        problema.setProperty("errores", errores);
        return problema;
    }

    /**
     * Versión plana para escribir desde filtros de servlet, donde no actúan los conversores
     * de Spring MVC que aplanan las propiedades del ProblemDetail.
     */
    public static Map<String, Object> comoMapa(ProblemDetail problema) {
        Map<String, Object> mapa = new LinkedHashMap<>();
        mapa.put("type", String.valueOf(problema.getType()));
        mapa.put("title", problema.getTitle());
        mapa.put("status", problema.getStatus());
        mapa.put("detail", problema.getDetail());
        if (problema.getInstance() != null) {
            mapa.put("instance", problema.getInstance().toString());
        }
        if (problema.getProperties() != null) {
            mapa.putAll(problema.getProperties());
        }
        return mapa;
    }

    /** Error de validación de un campo concreto. */
    public record ErrorCampo(String campo, String mensaje) {
    }
}
