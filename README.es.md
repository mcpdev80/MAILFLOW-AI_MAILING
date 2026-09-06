# MailFlow

**Asistente de correo electrónico con IA de código abierto. Usa cualquier LLM. Tu bandeja de entrada, tus reglas, tu privacidad.**

MailFlow clasifica correos entrantes, admite flujos de trabajo asistidos por IA y puede utilizar LLM locales o alojados.

## Inicio rápido (self-hosted)

```bash
git clone https://github.com/mcpdev80/MAILFLOW-AI_MAILING.git
cd MAILFLOW-AI_MAILING
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d --build
```

Consulta la documentación en [`docs/`](docs/) para configuración, despliegue y operación.

## Capacidades actuales

MailFlow ha evolucionado de forma sustancial respecto a la base original. El desarrollo actual incluye, entre otras cosas:

- flujos multiusuario y multibuzón
- clasificación y redacción asistidas por IA
- aprendizaje mediante DecisionMemory a partir de correcciones confirmadas
- bandeja de revisión, notificaciones y resumen diario
- revisión y aplicación segura por lotes sobre correos históricos
- controles de propiedad y acceso a buzones
- compositor, borradores, envío SMTP/XOAuth2 y adjuntos
- bandeja de entrada unificada y acciones básicas de cliente de correo
- TLS perimetral, certificados personalizados y aislamiento de red
- localización en alemán, inglés y español
- panel operativo y búsqueda

## Desarrollo

Consulta [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) para instrucciones de desarrollo y contribución.

## Licencia

Este repositorio se distribuye bajo la **GNU Affero General Public License v3.0 (AGPL-3.0)**. Consulta [`LICENSE`](LICENSE).

La AGPL permite el uso comercial, la modificación, la distribución y la operación del software, sujeto a sus condiciones, incluidas las obligaciones de código fuente aplicables a versiones modificadas ofrecidas a usuarios a través de una red.

Este repositorio **no exige una licencia comercial adicional**.

## Procedencia y copyright

Este repositorio deriva del proyecto MailFlow original creado por **Jonatan Garcia / JonatanGhub** y conserva su historial de licencia AGPL-3.0.

Modificaciones y ampliaciones sustanciales posteriores de este fork fueron creadas por **Marcel Pfingstgräf** y otros contribuidores. El copyright de cada contribución permanece con su respectivo autor salvo indicación expresa en contrario.

Para más detalles sobre atribución y procedencia, consulta [`NOTICE.md`](NOTICE.md).
