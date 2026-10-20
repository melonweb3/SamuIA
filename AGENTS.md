# SamuIA: identidad visual del personaje principal

- Instrucción explícita posterior v9: el usuario autoriza animar en ejecución la imagen oficial con un renderer 2D localizado, boca por capas/estados, parpadeo y micromovimientos. Esta petición sustituye la restricción anterior de que solo un rig pueda producir movimiento. Conserva intactos los PNG/ZIP y la identidad; no muevas toda la habitación ni el micrófono para fingir animación. Los vídeos son referencias internas, nunca la salida visual. Consulta `docs/avatar-engine-v9.md`.

Antes de crear, editar o integrar avatares, expresiones, escenas o assets del comentarista, lee [la referencia oficial](assets/reference/README.md) y [su manifiesto](assets/reference/identity.json).

- Las cinco vistas aportadas por el usuario son **el mismo personaje SamuIA**, no cinco personajes o diseños alternativos.
- Conserva cara, estructura facial, pelo, ojos, cejas, barba, ropa, gorra, estilo y proporciones visibles. Cambiar de expresión, gesto, cámara o fondo no debe cambiar su identidad.
- La referencia es de aspecto fotográfico realista: gorra beige hacia atrás, pelo corto oscuro, barba corta oscura y sudadera lisa clara con capucha y cordones. No conviertas el personaje en un diseño de dibujos animados ni sustituyas su vestuario sin una petición expresa del usuario.
- No inventes rasgos corporales que los retratos no muestran. No hay referencia aprobada de cuerpo completo, altura, pantalones o calzado.
- El SVG provisional ha sido retirado. Los retratos originales siguen disponibles en Ajustes. Por petición expresa posterior del usuario, el fallback integrado usa las cinco composiciones derivadas de `assets/runtime/scenes/composites-index.json`, con personaje y habitación en un PNG sin fondo blanco. No reintroduzcas otra cara como sustitución si falla una imagen.
- Consulta `source.storageStatus` del manifiesto y `assets/reference/originals-index.json`. Los cinco originales y sus ZIP están archivados con SHA-256. Nunca sobrescribas, recomprimas, retoques o recrees estos archivos. Las copias de ejecución y los PNG embebidos en el HTML deben conservar los mismos bytes.
- Mantén cualquier derivado futuro separado de los originales y sujeto a petición expresa. Las expresiones ausentes usan una de las cinco referencias, sin inventar otra cara. El HTML portátil debe incluir también los originales, sin depender de solicitudes de red.
- Estas reglas recogen la instrucción del usuario del 19 de octubre de 2026. Una petición posterior y explícita del usuario puede actualizar la referencia.
- Antes de modificar escenarios, lee `assets/reference/scenes/README.md`: originales ZIP/PNG conservados sin alteración, principal 05, gráficos y luz en capas independientes. Las banderas y escudos fotografiados son fijos; no confundirlos con los rótulos dinámicos del partido en foco.

- Instrucción posterior del usuario: la arquitectura del personaje se basa en `AvatarAnimationController`, no en imágenes fijas. Lee `docs/avatar-animation.md`. Las composiciones y retratos son fallbacks; conserva sus bytes. Usa el contrato independiente de animación, expresión, intensidad, mirada y habla para cualquier avatar 2D/3D futuro. No presentes los medidores simulados como animación facial o voz real.

- Corrección de encuadre posterior: los fallbacks permanecen quietos y muestran el escenario completo en 1672:941. SIMULATION respeta la presentación seleccionada; no fuerces retratos sobre la habitación. Los retratos originales se muestran como referencia aparte, sin montaje con el micrófono o escritorio. Las señales de animación solo deben mover un renderer con rig.

- La pantalla Partido de prueba usa `MatchSimulationSession` como coordinador aislado de los motores existentes; lee `docs/partido-prueba.md`. No simules aciertos/fallos escribiendo estados de memoria directamente ni introduzcas otro motor de comentarios. Los PNG siguen como fallback estático. Conserva el estudio y sus partidos al reiniciar este ensayo.
