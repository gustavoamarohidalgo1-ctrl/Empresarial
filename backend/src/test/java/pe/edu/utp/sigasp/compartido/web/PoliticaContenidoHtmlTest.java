package pe.edu.utp.sigasp.compartido.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

@DisplayName("PoliticaContenidoHtml · CSP estricta para el HTML del SPA")
class PoliticaContenidoHtmlTest {

    private static final String BASE = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            + "img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; "
            + "form-action 'self'; object-src 'none'";

    /** Script que agrega Angular cuando inserta el CSS crítico (beasties); su hash es fijo. */
    private static final String SCRIPT_BEASTIES = "document.querySelectorAll('link[data-beasties-media]')"
            + ".forEach(function(l){l.media=l.getAttribute('data-beasties-media');"
            + "l.removeAttribute('data-beasties-media')})";

    @Test
    @DisplayName("Sin scripts en línea la política es exactamente la base estricta")
    void base() {
        String html = "<!doctype html><html><head><style>body{margin:0}</style></head><body><app-root></app-root>"
                + "<script src=\"main-ABC.js\" type=\"module\"></script></body></html>";

        assertThat(PoliticaContenidoHtml.politica(html)).isEqualTo(BASE);
        assertThat(PoliticaContenidoHtml.politica("")).isEqualTo(BASE);
    }

    @Test
    @DisplayName("Cada script en línea ejecutable se permite solo por su hash SHA-256; los bloques de datos no")
    void hashDeScriptsEnLinea() {
        String html = "<body><script src=\"main.js\" type=\"module\"></script><script>" + SCRIPT_BEASTIES
                + "</script><SCRIPT type=\"application/ld+json\">{\"a\":1}</SCRIPT><script>   </script></body>";

        assertThat(PoliticaContenidoHtml.politica(html)).isEqualTo(BASE.replace("script-src 'self';",
                "script-src 'self' 'sha256-LMY6wYoFV9I4wWzxaq1N/dTpl4iurQktw706UCHK3vM=';"));
    }

    @Test
    @DisplayName("La cabecera solo se escribe en respuestas text/html y no pisa una CSP previa")
    void soloHtml() {
        PoliticaContenidoHtml politica = new PoliticaContenidoHtml(new DefaultResourceLoader());
        MockHttpServletRequest request = new MockHttpServletRequest();

        MockHttpServletResponse html = new MockHttpServletResponse();
        html.setContentType("text/html;charset=UTF-8");
        politica.writeHeaders(request, html);
        MockHttpServletResponse json = new MockHttpServletResponse();
        json.setContentType("application/json");
        politica.writeHeaders(request, json);
        MockHttpServletResponse sinTipo = new MockHttpServletResponse();
        politica.writeHeaders(request, sinTipo);
        MockHttpServletResponse previa = new MockHttpServletResponse();
        previa.setContentType("text/html");
        previa.setHeader(PoliticaContenidoHtml.CABECERA, "default-src 'none'");
        politica.writeHeaders(request, previa);

        assertThat(html.getHeader(PoliticaContenidoHtml.CABECERA)).isEqualTo(politica.politica());
        assertThat(json.getHeader(PoliticaContenidoHtml.CABECERA)).isNull();
        assertThat(sinTipo.getHeader(PoliticaContenidoHtml.CABECERA)).isNull();
        assertThat(previa.getHeader(PoliticaContenidoHtml.CABECERA)).isEqualTo("default-src 'none'");
    }
}
