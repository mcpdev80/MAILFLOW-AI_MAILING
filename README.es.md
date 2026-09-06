# MailFlow

**Asistente de email con IA de código abierto. Usa cualquier LLM. Tu bandeja de entrada, tus reglas, tu privacidad.**

MailFlow clasifica automáticamente emails, admite flujos de trabajo de correo asistidos por IA y puede funcionar con LLM locales o alojados.

## Inicio rápido (Self-hosted)

```bash
git clone https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git
cd MAILFLOW-AI_MAILING
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d --build
```

Consulta la documentación en [`docs/`](docs/) para configuración, despliegue y operación.

## Capacidades actuales

Este fork ha evolucionado sustancialmente más allá de la base original. El desarrollo actual incluye, entre otras cosas:

- flujos multi-buzón y multiusuario
- clasificación y escritura asistidas por IA
- aprendizaje mediante DecisionMemory
- bandeja de revisión, notificaciones y resúmenes diarios
- procesamiento histórico por lotes con revisión/aprobación
- controles de propiedad y acceso a buzones
- compositor, borradores, SMTP/XOAuth2 y adjuntos
- bandeja unificada y acciones de cliente de correo
- endurecimiento TLS y aislamiento de red
- localización en alemán, inglés y español
- panel operativo y búsqueda

## Desarrollo

Consulta [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).

## Licencia

Este repositorio se distribuye bajo la **GNU Affero General Public License v3.0 (AGPL-3.0)**. Consulta [`LICENSE`](LICENSE).

La AGPL permite uso comercial, modificación, distribución y operación de pago, siempre que se cumplan sus condiciones. Cuando una versión cubierta se modifica y se ofrece a usuarios para interacción remota a través de una red, la sección 13 de la AGPL puede exigir que esos usuarios tengan la oportunidad de recibir el Corresponding Source de la versión modificada.

Al distribuir versiones modificadas también deben conservarse o proporcionarse los avisos exigidos por la AGPL, incluidos avisos destacados de modificación con una fecha relevante.

Este repositorio **no impone un requisito separado de licencia comercial** y no concede una licencia propietaria sobre código upstream perteneciente a terceros.

## Procedencia y copyright

Este repositorio deriva del proyecto original **MailFlow**, creado por **Jonatan Garcia / JonatanGhub**, y conserva su historial de licencia AGPL-3.0.

**Aviso de modificación:** este fork contiene modificaciones sustanciales y nueva funcionalidad realizadas desde **septiembre de 2026**, incluido trabajo creado por **Marcel Pfingstgräf** y otros colaboradores.

El copyright de las partes upstream permanece con sus respectivos autores. El copyright de las modificaciones y nuevas contribuciones permanece con sus respectivos autores salvo cesión expresa.

Consulta [`NOTICE.md`](NOTICE.md) y [`COPYRIGHT.md`](COPYRIGHT.md) para más detalles.
