# SamuIA: identidad visual del personaje principal

Antes de crear, editar o integrar avatares, expresiones, escenas o assets del comentarista, lee [la referencia oficial](assets/reference/README.md) y [su manifiesto](assets/reference/identity.json).

- Las cinco vistas aportadas por el usuario son **el mismo personaje SamuIA**, no cinco personajes o diseños alternativos.
- Conserva cara, estructura facial, pelo, ojos, cejas, barba, ropa, gorra, estilo y proporciones visibles. Cambiar de expresión, gesto, cámara o fondo no debe cambiar su identidad.
- La referencia es de aspecto fotográfico realista: gorra beige hacia atrás, pelo corto oscuro, barba corta oscura y sudadera lisa clara con capucha y cordones. No conviertas el personaje en un diseño de dibujos animados ni sustituyas su vestuario sin una petición expresa del usuario.
- No inventes rasgos corporales que los retratos no muestran. No hay referencia aprobada de cuerpo completo, altura, pantalones o calzado.
- El SVG actual de la aplicación es un placeholder técnico anterior a esta referencia. **No es la identidad oficial** ni debe usarse como referencia para producir los assets definitivos.
- Consulta `source.storageStatus` del manifiesto. Mientras falte el archivo original, no afirmes que está archivado, integrado en el avatar o disponible para usarlo como entrada de una herramienta de imagen. No sustituyas el original por una imagen generada o una reconstrucción del texto.
- Al recibir el original, consérvalo sin modificaciones en `assets/reference/`, registra ruta y SHA-256 en el manifiesto y mantén los derivados de ejecución separados. Usa las vistas de ese mismo personaje para las nuevas expresiones.
- Estas reglas recogen la instrucción del usuario del 19 de octubre de 2026. Una petición posterior y explícita del usuario puede actualizar la referencia.
