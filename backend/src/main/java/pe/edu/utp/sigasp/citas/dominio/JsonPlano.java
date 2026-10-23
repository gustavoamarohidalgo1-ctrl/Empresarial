package pe.edu.utp.sigasp.citas.dominio;

import java.util.Map;
import java.util.StringJoiner;
import java.util.TreeMap;

/**
 * Serializa un mapa plano de texto a JSON sin depender de una librería. Basta para los datos
 * de los eventos (instantes, versiones e identificadores), que nunca contienen estructuras.
 */
final class JsonPlano {

    private JsonPlano() {
    }

    static String de(Map<String, String> datos) {
        StringJoiner json = new StringJoiner(",", "{", "}");
        new TreeMap<>(datos).forEach((clave, valor) ->
                json.add(texto(clave) + ":" + (valor == null ? "null" : texto(valor))));
        return json.toString();
    }

    private static String texto(String valor) {
        StringBuilder sb = new StringBuilder(valor.length() + 2).append('"');
        for (char c : valor.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }
}
