# Correo en OpenProject: configuracion SMTP y notificaciones

Este documento describe la configuracion de correo en OpenProject, su flujo de envio de notificaciones y la arquitectura involucrada.

## Arquitectura (texto)

Admin UI
  |
  |-- Admin::Settings::MailNotificationsSettingsController#show/update
  |     `app/controllers/admin/settings/mail_notifications_settings_controller.rb`
  |
  |-- Settings::UpdateService -> Setting[name]=value
  |     `app/services/settings/update_service.rb`
  |     `app/models/setting.rb`
  |
  |-- Setting.reload_mailer_settings!
  |     `app/models/setting/mail_settings.rb`
  |     |
  |     +--> ActionMailer::Base.delivery_method
  |     +--> ActionMailer::Base.smtp_settings
  |
  +--> ApplicationMailer / Jobs
        |
        +--> Interceptors (headers y validacion de destinatarios)
        |     `config/initializers/register_mail_interceptors.rb`
        |     `app/mailers/interceptors/default_headers.rb`
        |     `app/mailers/interceptors/do_not_send_mails_without_recipient.rb`
        |
        +--> Notifications::WorkflowJob
              `app/workers/notifications/workflow_job.rb`
              |
              +--> Notifications::CreateFromModelService
              |     `app/services/notifications/create_from_model_service.rb`
              |     |
              |     +--> Notification (mail_alert_sent, mail_reminder_sent)
              |           `app/models/notification.rb`
              |
              +--> Notifications::MailService
                    `app/services/notifications/mail_service.rb`
                    |
                    +--> MailService::*Strategy (segun recurso)
                    |     `app/services/notifications/mail_service/*_strategy.rb`
                    |
                    +--> Mails::MailerJob / Mails::DeliverJob
                          `app/workers/mails/mailer_job.rb`
                          `app/workers/mails/deliver_job.rb`
                          |
                          +--> ApplicationMailer / UserMailer / WorkPackageMailer / DigestMailer / Reminders::NotificationMailer
                                `app/mailers/application_mailer.rb`
                                `app/mailers/user_mailer.rb`
                                `app/mailers/digest_mailer.rb`
                                `app/mailers/reminders/notification_mailer.rb`

## Paso 1: Pantalla de administracion

**Archivo:** `app/views/admin/settings/mail_notifications_settings/show.html.erb`  
**Descripcion:** Formulario de configuracion de correo y SMTP.

Campos principales:
- `mail_from`, `bcc_recipients`, `plain_text_mail`, `emails_header`, `emails_footer`.
- Selector `email_delivery_method` con opciones `smtp`, `sendmail` y `letter_opener` (solo en development).
- Bloque SMTP con `smtp_address`, `smtp_port`, `smtp_domain`, `smtp_authentication`, `smtp_user_name`, `smtp_password`, `smtp_enable_starttls_auto`, `smtp_ssl`.

## Paso 2: Guardado de settings

**Controlador:** `app/controllers/admin/settings/mail_notifications_settings_controller.rb`  
**Descripcion:** Valida `mail_from` antes de guardar.

**Servicio:** `app/services/settings/update_service.rb`  
**Descripcion:** Persiste los valores via `Setting[name] = value`.

**Modelo base:** `app/models/setting.rb`  
**Descripcion:** Maneja cache, serializacion y reglas de escritura.

## Paso 3: Definiciones y defaults

**Archivo:** `config/constants/settings/definition.rb`  
**Descripcion:** Define los defaults y restricciones de settings de email/SMTP.

Claves relevantes:
- `email_delivery_configuration` (inapp/legacy) y `email_delivery_method`.
- `smtp_address`, `smtp_port`, `smtp_domain`, `smtp_user_name`, `smtp_password`, `smtp_authentication`.
- `smtp_enable_starttls_auto`, `smtp_ssl`, `smtp_timeout`, `smtp_openssl_verify_mode`.

## Paso 4: Aplicacion real de SMTP

**Archivo:** `app/models/setting/mail_settings.rb`  
**Descripcion:** Ajusta ActionMailer en runtime:
- `ActionMailer::Base.delivery_method`.
- `ActionMailer::Base.smtp_settings` con TLS/SSL y timeouts.
- Si `smtp_authentication == :none`, elimina `user_name`, `password`, `authentication`.

**Recarga en web:** `app/controllers/application_controller.rb` (before_action `reload_mailer_settings!`).  
**Recarga en jobs:** `app/workers/shared_job_setup.rb` (around_perform).

## Paso 5: Interceptores de correo

**Registro:** `config/initializers/register_mail_interceptors.rb`  
**Descripcion:** Envia headers estandar y evita correos sin destinatario.

**Headers por defecto:** `app/mailers/interceptors/default_headers.rb`  
**Descripcion:** Agrega `X-Mailer`, `X-OpenProject-Host`, `X-OpenProject-Site`, etc.

**Bloqueo sin recipients:** `app/mailers/interceptors/do_not_send_mails_without_recipient.rb`.

## Paso 6: Creacion de notificaciones

**Servicio:** `app/services/notifications/create_from_model_service.rb`  
**Descripcion:** Crea `Notification` con flags:
- `mail_alert_sent` (alertas inmediatas).
- `mail_reminder_sent` (digest/recordatorios).

**Modelo:** `app/models/notification.rb`  
**Descripcion:** Contiene `reason` y scopes `mail_alert_unsent`, `mail_reminder_unsent`.

## Paso 7: Workflow de notificaciones

**Job:** `app/workers/notifications/workflow_job.rb`  
**Descripcion:**
1. Crea notificaciones (in-app).
2. Envia inmediatas para `mentioned`.
3. Envia el resto luego de `journal_aggregation_time_minutes`.

## Paso 8: Envio por estrategia

**Servicio:** `app/services/notifications/mail_service.rb`  
**Descripcion:** Selecciona estrategia por recurso y marca el envio en transaccion.

**Estrategias:** `app/services/notifications/mail_service/*_strategy.rb`  
**Descripcion:** Define el mailer y metodo exacto por tipo:
- WorkPackage (mencionados).
- News.
- Wiki.
- Message.
- Comment.

## Paso 9: Jobs de entrega y mailers

**Job base:** `app/workers/mails/deliver_job.rb`  
**Descripcion:** Renderiza y ejecuta `deliver_now`.

**Job de entrega diferida:** `app/workers/mails/mailer_job.rb`  
**Descripcion:** Usa `SharedJobSetup` y retry.

**Mailers clave:**
- `app/mailers/application_mailer.rb` (from/reply_to por `Setting.mail_from`).
- `app/mailers/user_mailer.rb` (cuentas, noticias, wiki, etc).
- `app/mailers/digest_mailer.rb` (resumen diario).
- `app/mailers/reminders/notification_mailer.rb` (recordatorios).

## Paso 10: Digest y recordatorios

**Digest:** `app/workers/mails/reminder_job.rb`  
**Descripcion:** Envia resumen de notificaciones no leidas.

**Recordatorio personal:** `app/workers/reminders/schedule_reminder_job.rb`  
**Descripcion:** Crea notificacion y dispara mail inmediato si el usuario lo permite.

## Paso 11: Test de correo

**Accion:** `app/controllers/admin_controller.rb` (test_email)  
**Descripcion:** Envia un correo de prueba con `UserMailer.test_mail`.

## Paso 12: Variables de entorno y configuration.yml

**Archivo:** `config/constants/settings/definition.rb`  
**Descripcion:** Permite override por ENV, por ejemplo:
- `SMTP_ADDRESS`, `SMTP_PORT`, `SMTP_USER_NAME`, `SMTP_PASSWORD`.
- `EMAIL_DELIVERY_METHOD`.

Settings "no writable" solo por config/env (por ejemplo `smtp_openssl_verify_mode` y `email_delivery_configuration`).

## Uso funcional por roles y niveles (administrador, usuario, proyecto)

### Administrador (nivel global)
- Configura el proveedor SMTP, remitente y formato en:  
  `app/views/admin/settings/mail_notifications_settings/show.html.erb`.
- Define el metodo de envio global (`smtp`, `sendmail`, `letter_opener`) y verifica con "Send a test email".
- Controla settings globales como `mail_from`, `emails_header`, `emails_footer`, `plain_text_mail`, `bcc_recipients`.
- Si hay valores por ENV/configuracion, esos campos quedan no editables en la UI.

### Usuario (preferencias personales)
- Decide si recibe avisos inmediatos o digest (resumen):  
  `app/models/user_preference.rb` (`immediate_reminders`, `daily_reminders`, `pause_reminders`).
- Ajusta el tipo de notificaciones que desea (mencionado, asignado, observado, etc).  
  `app/models/notification_setting.rb`.
- Las reglas de validacion (por ejemplo, alertas por correo solo globales) estan en:  
  `app/contracts/user_preferences/params_contract.rb`.

### Proyecto (ajustes por proyecto)
- Los usuarios pueden activar notificaciones por proyecto (cuando el modelo lo permite).  
  `NotificationSetting` permite `project_id` y se filtra con `.applicable(project)` en  
  `app/services/notifications/create_from_model_service.rb`.
- Los eventos de correo "solo email" (news/wiki/memberships) se gestionan a nivel global y
  se valida que no existan overrides por proyecto.

### Flujo funcional completo (vista de negocio)
1. Admin configura SMTP y remitente global.
2. Usuario define si quiere alertas inmediatas y/o digest.
3. Se genera un evento (work package, news, wiki, mensaje, comentario, recordatorio).
4. Se crea la notificacion y se decide si hay correo inmediato o diferido.
5. Se envia via mailer con la configuracion SMTP global aplicada.
