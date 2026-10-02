# Кузнецкий округ — публикация и вход через Google и Telegram

В архиве исходники сайта, автоматическая публикация на GitHub Pages и SQL для Supabase. В рабочей сборке используются реальные аккаунты Google и Telegram. Тестовые актёры и идеи в базу не переносятся; лор и 12 персонажей загружаются отдельно.

## 1. Создайте базу Supabase

На https://supabase.com/dashboard создайте новый проект на Free. Сохраните пароль базы у себя. В SQL Editor выполните сначала весь `supabase/schema.sql`, затем весь `supabase/content.sql`. Используйте новый пустой проект. Второй файл можно повторить, но он заменит тексты исходных персонажей и лора.

В настройках проекта скопируйте Project URL и **Publishable key** (`sb_publishable_...`). URL обычно находится в Data API, ключ — в API Keys. Только публичный ключ используется во фронтенде. Secret key, service_role и пароль базы сюда не нужны.

## 2. Опубликуйте исходники на GitHub

Создайте публичный репозиторий `kuznetsky-okrug` с основной веткой `main`. Распакуйте архив и загрузите его содержимое в корень репозитория, включая `.github/workflows/deploy.yml` и `package-lock.json`. Не загружайте ZIP вместо исходников и не добавляйте лишнюю внешнюю папку.

Удобно сделать через GitHub Desktop: клонируйте репозиторий, скопируйте файлы, Commit → Push. В браузере тоже можно загрузить файлы; если скрытая папка `.github` пропущена, создайте файл `.github/workflows/deploy.yml` вручную через Add file → Create new file и вставьте его содержимое.

Откройте Settings → Secrets and variables → Actions → Variables. Создайте две Repository variables:

- `VITE_SUPABASE_URL`: Project URL из Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Publishable key из Supabase.

В Settings → Pages выберите Source: **GitHub Actions**. После настройки переменных откройте Actions → Deploy to GitHub Pages → Run workflow → main. Дождитесь успешных build и deploy. Адрес появится в Settings → Pages, обычно `https://ВАШ_ЛОГИН.github.io/kuznetsky-okrug/`.

При каждом следующем push в main сайт обновится автоматически. После изменения переменных запускайте workflow повторно: они встраиваются во время сборки.

## 3. Разрешите возврат на сайт

В Supabase → Authentication → URL Configuration установите адрес сайта с завершающим `/` и в **Site URL**, и в **Redirect URLs**, например `https://ВАШ_ЛОГИН.github.io/kuznetsky-okrug/`.

## 4. Настройте Google

Откройте https://console.cloud.google.com/ и создайте проект. В Google Auth Platform заполните Branding (название сайта и контактная почта), Audience (External), Data Access. Нужны только `openid`, `userinfo.email`, `userinfo.profile`.

Создайте OAuth client в Clients, тип **Web application**:

- Authorized JavaScript origins: `https://ВАШ_ЛОГИН.github.io` — без `/kuznetsky-okrug/`.
- Authorized redirect URIs: callback, показанный в Supabase → Authentication → Sign In / Providers → Google. Обычно `https://ID_ПРОЕКТА.supabase.co/auth/v1/callback`.

Скопируйте Client ID и Client Secret в настройки Google provider в Supabase, включите Google и сохраните. **Client Secret хранится только в Supabase.**

Для первого теста добавьте свою Google-почту в Audience → Test users. Для команды разрешите её аккаунты в режиме тестирования или переведите приложение в Production через Audience → Publish app; Google может запросить дополнительные действия в консоли. Запрос доступа к почтовому ящику не нужен.

Официальный порядок: https://supabase.com/docs/guides/auth/social-login/auth-google

## 4а. Настройте Telegram

1. В Telegram откройте @BotFather и создайте бота командой `/newbot`.
2. Откройте мини-приложение BotFather → ваш бот → Login Widget. Если показан старый виджет, выберите Switch to OpenID Connect Login.
3. В Supabase → Authentication → Providers нажмите New Provider → Auto-discovery (OIDC). Укажите:
   - Identifier: `custom:telegram` (кнопка сайта использует именно его).
   - Name: Telegram.
   - Issuer URL: `https://oauth.telegram.org`.
   - Scopes: `openid`, `profile`.
   - Email optional: **true** — Telegram не передаёт email.
   - PKCE: оставить включённым.
4. Скопируйте Callback URL из формы Supabase. В BotFather добавьте его в Allowed URLs / Redirect URIs. Для облачного проекта обычно `https://ID_ПРОЕКТА.supabase.co/auth/v1/callback`, но используйте адрес из формы. Также добавьте origin сайта `https://ВАШ_ЛОГИН.github.io` в разрешённые origins, если форма BotFather показывает такое поле.
5. Полученные в Login Widget Client ID и Client Secret внесите в форму провайдера Supabase. Создайте и включите провайдер.
6. Нажмите на сайте «Войти через Telegram», подтвердите вход, сохраните анкету и проверьте возврат после выхода. Телефон и право отправлять сообщения не запрашиваем.

Client Secret Telegram хранится только в Supabase, а не в GitHub или исходниках. Bot token из `/newbot` не заменяет OAuth Client Secret из Login Widget. Дополнительные GitHub Variables для Telegram не нужны.

Официальные инструкции:
- https://core.telegram.org/bots/telegram-login
- https://supabase.com/docs/guides/auth/custom-oauth-providers
- https://supabase.com/docs/guides/self-hosting/self-hosted-custom-oauth-providers#example-telegram (пример параметров Telegram; Docker для нашего облачного проекта не нужен).

Для возвращения к одной анкете используйте один и тот же способ входа. Автоматическое объединение Google и Telegram в этом сайте не реализовано: Telegram не сообщает email. Не назначайте права организатора второму аккаунту, если не хотите отдельный кабинет.

## 5. Назначьте себе права организатора

Откройте сайт и войдите через Google или Telegram один раз. Затем выполните в Supabase SQL Editor, заменив адрес на почту именно вошедшего аккаунта:

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'ВАША_ПОЧТА'
on conflict do nothing;
```

Если вошли через Telegram, email отсутствует. В Authentication → Users найдите запись своего входа, скопируйте User UID и используйте вместо запроса по почте:

```sql
insert into public.admin_users (user_id)
values ('ВАШ_USER_UID'::uuid)
on conflict do nothing;
```

Обновите сайт. Появится «Управление», а «Моя анкета» останется доступной. Заполните свою анкету с ролью Фёдора и утвердите её в управлении — тогда попадёте в публичный состав. Права организатора не назначаются пользователями через сайт.

## 6. Проверьте запуск

В обычном окне войдите своим аккаунтом, сохраните анкету, предложите идею. В отдельном окне войдите вторым разрешённым Google-аккаунтом: управление и чужие контакты ему недоступны. В окне без входа доступны состав, лор и персонажи; идеи закрыты. Утвердите вторую заявку в управлении и проверьте появление имени и роли в составе.

Перед приглашением команды укажите своё имя и контакт в `privacyPage()` файла `src/main.js`.

Если видите «Вход пока не настроен», проверьте GitHub Variables и повторите workflow. Ошибка redirect_uri_mismatch означает неверный callback в Google. Возврат на неправильный адрес — проверьте Site URL и Redirect URLs в Supabase. Если данных нет — выполните оба SQL-файла и проверьте, что URL и ключ относятся к одному проекту.

## Локальная работа

Нужен Node.js 22. `npm ci`, затем `npm run dev`. Без настроек локальная разработка использует демо. Для реальной базы скопируйте `.env.example` в `.env.local` и заполните URL и публичный ключ, добавьте локальный адрес в Supabase Redirect URLs. `npm run build` создаёт рабочую сборку; `npm run build:demo` создаёт демо. GitHub workflow всегда отключает демо.

Проверены сборка, схема и права доступа в локальном PostgreSQL-окружении. Живой вход Google / Telegram и размещение требуют ваших настроек аккаунтов и окончательной проверки после публикации. Free-тарифы имеют лимиты; аккаунт оплаты для этого руководства не требуется, используйте предложенный бесплатный план.

## VK ID

В текущей версии VK ID не подключён. Современный официальный SDK VK использует PKCE и возвращаемый `device_id` при обмене кода, а получение профиля выполняет через POST. Нельзя обещать совместимость простого заполнения трёх URL в универсальном провайдере Supabase без проверки этих деталей. Для надёжного подключения следует отдельно проверить интеграцию или реализовать серверный адаптер, например через Supabase Edge Functions, с проверкой ответа VK и созданием сессии Supabase. Потребуется приложение VK ID и настройка разрешённых адресов.

Исходники официального SDK: https://github.com/VKCOM/vkid-web-sdk/blob/master/src/auth/auth.ts
