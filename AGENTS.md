# SamuIA: identidad visual del personaje principal

Antes de crear, editar o integrar avatares, expresiones, escenas o assets del comentarista, lee [la referencia oficial](assets/reference/README.md) y [su manifiesto](assets/reference/identity.json).

- Las cinco vistas aportadas por el usuario son **el mismo personaje SamuIA**, no cinco personajes o diseños alternativos.
- Conserva cara, estructura facial, pelo, ojos, cejas, barba, ropa, gorra, estilo y proporciones visibles. Cambiar de expresión, gesto, cámara o fondo no debe cambiar su identidad.
- La referencia es de aspecto fotográfico realista: gorra beige hacia atrás, pelo corto oscuro, barba corta oscura y sudadera lisa clara con capucha y cordones. No conviertas el personaje en un diseño de dibujos animados ni sustituyas su vestuario sin una petición expresa del usuario.
- No inventes rasgos corporales que los retratos no muestran. No hay referencia aprobada de cuerpo completo, altura, pantalones o calzado.
- El SVG provisional ha sido retirado. El avatar usa exclusivamente los cinco PNG originales oficiales, seleccionables en Ajustes. No reintroduzcas otra cara como sustitución si falla una imagen.
- Consulta `source.storageStatus` del manifiesto y `assets/reference/originals-index.json`. Los cinco originales y sus ZIP están archivados con SHA-256. Nunca sobrescribas, recomprimas, retoques o recrees estos archivos. Las copias de ejecución y los PNG embebidos en el HTML deben conservar los mismos bytes.
- Mantén cualquier derivado futuro separado de los originales y sujeto a petición expresa. Las expresiones ausentes usan una de las cinco referencias, sin inventar otra cara. El HTML portátil debe incluir también los originales, sin depender de solicitudes de red.
- Estas reglas recogen la instrucción del usuario del 19 de octubre de 2026. Una petición posterior y explícita del usuario puede actualizar la referencia.
