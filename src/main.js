import './styles.css';
import { configured, demoMode, db, query, returnUrl, readableError } from './api.js';
import { project } from './project.js';
import { getDemoRole, setDemoRole, resetDemo } from './demo.js';

const root = document.querySelector('#app');
let user = null, admin = false, profile = null, revision = 0;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e = escape;
const statusLabels = {submitted:'На рассмотрении',accepted:'В составе',declined:'Не выбрана'};
const navs = [['cast','Актёрский состав'],['ideas','Идеи сюжета'],['lore','Лор трилогии'],['characters','Персонажи']];
const route = () => location.hash.startsWith('#/') ? location.hash.slice(2).split('?')[0] || 'cast' : 'cast';
const go = page => { if(route() === page) render(); else location.hash = '/' + page; };
const field = (label,name,options={}) => `<label class="field"><span>${e(label)}</span><input name="${e(name)}" type="${options.type || 'text'}" ${options.required===false?'':'required'} ${options.min?`minlength="${options.min}"`:''} maxlength="${options.max || 200}" autocomplete="${options.auto || 'off'}" value="${e(options.value)}" ${options.placeholder?`placeholder="${e(options.placeholder)}"`:''}></label>`;
const area = (label,name,options={}) => `<label class="field"><span>${e(label)}</span><textarea name="${e(name)}" ${options.required===false?'':'required'} maxlength="${options.max || 5000}" placeholder="${e(options.placeholder || '')}">${e(options.value)}</textarea></label>`;
const errors = '<p class="form-error" role="alert"></p><p class="form-success" role="status"></p>';
const heading = (title,desc,action='') => `<div class="heading"><div><h1>${e(title)}</h1>${desc?`<p>${e(desc).replaceAll('\n','<br>')}</p>`:''}</div>${action}</div>`;
const empty = (title,desc,number='—') => `<div class="empty"><div class="number" aria-hidden="true">${e(number)}</div><h3>${e(title)}</h3><p>${e(desc).replaceAll('\n','<br>')}</p></div>`;
const lock = (title,desc) => `<div class="lock"><div class="eyebrow">Для участников фильма</div><h2>${e(title)}</h2><p>${e(desc).replaceAll('\n','<br>')}</p><a class="button" href="#/login">Войти</a> <a class="button secondary" href="#/register">Создать аккаунт</a></div>`;
const initials = name => name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
function actorAvatar(name,url){
  let photo='';
  try{const parsed=new URL(url);if(parsed.protocol==='https:')photo=parsed.href;}catch{}
  return `<div class="avatar" aria-hidden="true"><span>${e(initials(name || 'Участник'))}</span>${photo?`<img class="avatar-photo" src="${e(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</div>`;
}
const date = value => new Date(value).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
function toast(message) { const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');setTimeout(()=>el.classList.remove('visible'),4000); }
function frame(page) {
  root.innerHTML=`<div class="shell">${demoMode?`<div class="demo-bar"><div><b>Локальный прототип</b><span>Тестовые данные · не канон трилогии</span></div><div class="demo-controls"><label for="demo-role">Смотреть как</label><select id="demo-role"><option value="guest" ${getDemoRole()==='guest'?'selected':''}>Гость</option><option value="actor" ${getDemoRole()==='actor'?'selected':''}>Актёр</option><option value="organizer" ${getDemoRole()==='organizer'?'selected':''}>Организатор и актёр</option></select><button id="demo-reset" type="button">Сбросить демо</button></div></div>`:''}<header class="header"><a class="brand" href="#/cast"><img src="${import.meta.env.BASE_URL}favicon.svg" alt=""><span>${e(project.title)}</span></a><nav class="nav" aria-label="Основная навигация">${navs.map(([id,label])=>`<a href="#/${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${label}</a>`).join('')}${admin?`<a href="#/admin" ${page==='admin'?'aria-current="page"':''}>Управление</a>`:''}</nav><a class="account" href="#/${user?'profile':'login'}">${user?'Моя анкета':'Войти'}</a></header><main id="main" tabindex="-1" class="content"><div class="topline"><b>III</b><span></span>${e(project.subtitle)}</div><div id="view" aria-busy="true"><div class="loading">Загружаем…</div></div></main><footer class="footer"><span>${e(project.title)} · ${demoMode?'Демо сохраняет изменения только в этом браузере':'Собираем команду заключительного фильма'}</span><a href="#/privacy">Как используются ваши данные</a></footer></div>`;
}
async function rows(table,order='created_at') {
  if (!db) return [];
  return query(db.from(table).select(table==='cast_members'?'id,display_name,role_name,participation,created_at,avatar_url':'*').order(order,{ascending:table==='lore_chapters'||table==='characters'}));
}
function offline() { return !configured ? '<div class="notice">Вход пока не настроен. Организатор подключает аккаунты участников; попробуйте позже.</div>' : ''; }
async function render() {
  const current=++revision,page=route();frame(page);
  try {
    let html;
    if(page==='cast') html=await castPage();
    else if(page==='ideas') html=await ideasPage();
    else if(page==='lore') html=await lorePage();
    else if(page==='characters') html=await charactersPage();
    else if(['login','register','forgot','reset'].includes(page)) html=authPage(page);
    else if(page==='profile') html=await profilePage();
    else if(page==='admin') html=await adminPage();
    else if(page==='privacy') html=privacyPage();
    else html=heading('Страница не найдена','Вернитесь к актёрскому составу.')+'<a class="button" href="#/cast">К составу</a>';
    if(current!==revision) return;
    const view=document.querySelector('#view');view.innerHTML=html;view.setAttribute('aria-busy','false');
    wire(page); document.title = `${navs.find(([id])=>id===page)?.[1] || ({profile:'Моя анкета',admin:'Управление',register:'Регистрация',login:'Вход',forgot:'Восстановление пароля',reset:'Новый пароль',privacy:'Ваши данные'}[page] || 'Страница')} — ${project.title}`;
  } catch(error) {
    if(current!==revision)return;
    document.querySelector('#view').innerHTML=`<div class="notice error" role="alert">${e(readableError(error))}</div><button class="button secondary" id="retry">Попробовать снова</button>`;
    document.querySelector('#view').setAttribute('aria-busy','false');document.querySelector('#retry').onclick=()=>render();
  }
}
async function castPage() {
  const [cast,chars] = await Promise.all([rows('cast_members'),rows('characters','sort_order')]);
  const open=chars.filter(c=>c.casting_status==='open').length;
  return heading('Собираем финальный состав',project.description.replace('. Собираем','.\nСобираем'),`<a class="button" href="#/${user?'profile':'register'}">${user?'Заполнить анкету':'Хочу участвовать'}</a>`)+offline()+
    `<div class="metrics"><div class="metric"><span>Актёров в составе</span><strong>${cast.length}</strong></div><div class="metric"><span>Открытых ролей</span><strong>${open}</strong></div><div class="metric"><span>Лет после прошлых съёмок</span><strong>11</strong></div></div><div class="grid"><section class="panel"><div class="section-head"><h2>Команда фильма</h2><span>${cast.length} участников</span></div>${cast.length?cast.map(c=>`<article class="cast-card">${actorAvatar(c.display_name,c.avatar_url)}<div><h3>${e(c.display_name)}</h3><p>${e(c.role_name || 'Роль уточняется')}</p></div><span class="chip">${c.participation==='returning'?'Прежний состав':'Новый актёр'}</span></article>`).join(''):empty('Первый шаг — собрать команду','Здесь появятся актёры, чьё участие подтвердит организатор. Если вы снимались раньше или хотите присоединиться впервые, заполните анкету.','01')}</section><aside class="panel"><div class="aside-title"><h2>Присоединиться</h2><span class="chip">Открытый набор</span></div><p class="muted small">Прежним актёрам — сообщить, готовы ли вы вернуться.<br>Новым — рассказать о себе и выбрать желаемую роль.</p><p class="muted small">Если вы иногородний, но хотите принять участие, возможна ваша интеграция с помощью ИИ-монтажа.</p><a class="button full" href="#/${user?'profile':'register'}">${user?'Моя анкета':'Создать аккаунт'}</a><div class="steps"><div class="step"><b>01</b><div><h3>Расскажите о себе</h3><p>Ваш город и возможность участвовать в съёмках локально в НВКЗ.</p></div></div><div class="step"><b>02</b><div><h3>Познакомьтесь с историей</h3><p><a class="text-link" href="#/lore">Лор трилогии</a> и <a class="text-link" href="#/characters">персонажи</a> помогут найти свою роль.</p></div></div><div class="step"><b>03</b><div><h3>Предложите идею</h3><p>Обсудим, как завершить историю вместе.</p></div></div></div></aside></div><section class="archive-block" aria-labelledby="archive-title"><h2 id="archive-title">Две первые серии</h2><div class="archive-previews"><img src="${import.meta.env.BASE_URL}previous-films.png" alt="Превью второй и первой серий «Кузнецкого округа», снятых 11 лет назад" width="437" height="169" loading="lazy"><a class="archive-link episode-second" href="${e(project.episodes.second)}" target="_blank" rel="noopener noreferrer" aria-label="Смотреть вторую серию «Кузнецкого округа» на YouTube — откроется в новой вкладке"></a><a class="archive-link episode-first" href="${e(project.episodes.first)}" target="_blank" rel="noopener noreferrer" aria-label="Смотреть первую серию «Кузнецкого округа» на YouTube — откроется в новой вкладке"></a></div></section>`;
}
async function lorePage() {
  const chapters=await rows('lore_chapters','sort_order');
  return 
    (chapters.length?`<div class="lore-content">${chapters.map((c,i)=>`<article class="chapter" id="chapter-${e(c.id)}"><h2>${e(c.title)}</h2><div class="prose">${e(c.content)}</div></article>`).join('')}</div>`:`<div class="content-empty">${empty('Историю скоро добавим','Организатор опубликует пересказ прошлых частей и правила мира. Здесь будет канон трилогии, на который можно опираться в новых идеях.','I / II / III')}${admin?'<p><a class="button secondary" href="#/admin">Добавить раздел</a></p>':''}</div>`);
}
async function charactersPage() {
  const chars=await rows('characters','sort_order');
  return heading('Персонажи','Характеры, связи, особенности и роли в заключительном фильме.')+
    (chars.length?`<div class="cards">${chars.map((c,i)=>`<article class="character"><div class="index"><span>${String(i+1).padStart(2,'0')}</span><span class="chip ${c.casting_status==='cast'?'chip-cast':''}">${c.casting_status==='open'?'Нужен актёр':c.casting_status==='cast'?'✓ Актёр выбран':'Участие уточняется'}</span></div><h2>${e(c.name)}</h2><p>${e(c.description)}</p><details><summary>Характер и история</summary>${[['Характер',c.personality],['Особенности',c.traits],['Связи с героями',c.relationships],['История в трилогии',c.history]].filter(([,v])=>v).map(([label,value])=>`<div class="detail-line"><strong>${e(label)}</strong>${e(value)}</div>`).join('')}</details>${c.casting_status==='open'?`<p><a class="text-link" href="#/${user?'profile':'register'}">Подать анкету на эту роль</a></p>`:''}</article>`).join('')}</div>`:`<div class="content-empty">${empty('Каталог героев ещё не заполнен','Здесь появится отдельная карточка каждого персонажа: его характер, особенности, история и связи с другими героями.','CAST')}${admin?'<p><a class="button secondary" href="#/admin">Добавить персонажа</a></p>':''}</div>`);
}
async function ideasPage() {
  let html=heading('Как закончится история?','Предложения участников по сюжету заключительного фильма.');
  if(!user) return html+lock('Обсудим финал вместе','Войдите или зарегистрируйтесь, чтобы читать предложения команды и делиться своими идеями.');
  const ideas=await query(db.from('ideas').select('*, profiles(display_name)').order('created_at',{ascending:false}));
  return html+`<div class="grid"><section>${ideas.length?ideas.map(i=>`<article class="idea"><div class="idea-meta"><span>${e(i.profiles?.display_name || 'Участник')}</span><span>·</span><time datetime="${e(i.created_at)}">${e(date(i.created_at))}</time></div><h2>${e(i.title)}</h2><p>${e(i.content)}</p>${i.user_id===user.id||admin?`<div class="idea-actions"><button class="button secondary small delete-idea" data-id="${e(i.id)}">Удалить идею</button></div>`:''}</article>`).join(''):empty('Первая идея может быть вашей','Что стало с героями за одиннадцать лет? Какую историю хочется завершить? Предложите свою версию финала.','III')}</section><aside class="panel"><form id="idea-form" class="form"><h2>Предложить идею</h2>${field('Название','title',{max:160,placeholder:'О чём ваша идея?'})}${area('Идея сюжета','content',{max:10000,placeholder:'События, герои и то, как это связано с прошлыми частями…'})}${errors}<button class="button" type="submit">Опубликовать идею</button><span class="help">Ваше имя и предложение увидят зарегистрированные участники.</span></form></aside></div>`;
}
const loginIcons = {
  google: `<svg class="provider-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12" fill="#fff"/><path fill="#4285F4" d="M20.64 12.2c0-.64-.06-1.25-.17-1.84H12v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.62Z"/><path fill="#34A853" d="M12 21c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.34 0-4.32-1.58-5.03-3.71H3.98v2.33A9 9 0 0 0 12 21Z"/><path fill="#FBBC05" d="M6.97 13.71A5.4 5.4 0 0 1 6.69 12c0-.59.1-1.17.28-1.71V7.96H3.98A9 9 0 0 0 3 12c0 1.45.35 2.82.98 4.04l2.99-2.33Z"/><path fill="#EA4335" d="M12 6.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A8.65 8.65 0 0 0 12 3a9 9 0 0 0-8.02 4.96l2.99 2.33C7.68 8.16 9.66 6.58 12 6.58Z"/></svg>`,
  telegram: `<svg class="provider-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path fill="#fff" d="m5.2 11.5 12.1-4.7c.56-.2 1.05.14.87.96l-2.06 9.7c-.15.69-.56.85-1.13.53l-3.14-2.32-1.52 1.46c-.17.17-.31.31-.64.31l.23-3.19 5.8-5.24c.25-.23-.06-.35-.39-.13l-7.17 4.52-3.09-.96c-.67-.21-.68-.67.14-.99Z"/></svg>`
};
function authPage(page) {
  if(demoMode) return `<section class="auth"><h1>${page==='register'?'Присоединиться к фильму':'Войти в проект'}</h1><p class="muted">В финальной версии здесь будет вход через выбранные вами сервисы.</p><div class="panel"><div class="form"><h2>Посмотреть кабинет</h2><p class="help">Сейчас вход демонстрационный: реальные аккаунты не создаются, пароль не нужен.</p><button class="button demo-enter" data-role="actor">Войти как тестовый актёр</button><button class="button secondary demo-enter" data-role="organizer">Войти как организатор и актёр</button><hr><span class="help">Варианты будущего входа</span><div class="auth-providers"><span>Google</span><span>Telegram</span><span>VK ID</span></div></div></div></section>`;
  if(user && !['reset'].includes(page))return heading('Вы уже вошли',`Аккаунт: ${profile?.display_name || user.email || 'Участник'}`)+'<a class="button" href="#/profile">К моей анкете</a>';
  return `<section class="auth"><h1>${page==='register'?'Присоединиться к фильму':'Войти в проект'}</h1><p class="muted">Вход через Google или Telegram. При первом входе аккаунт участника создаётся автоматически.</p>${offline()}<div class="panel"><div class="form"><button class="button full oauth-login" data-provider="google" id="google-login" ${!configured?'disabled':''}>${loginIcons.google}<span>Войти через Google</span></button><button class="button secondary full oauth-login" data-provider="custom:telegram" id="telegram-login" ${!configured?'disabled':''}>${loginIcons.telegram}<span>Войти через Telegram</span></button></div><p class="help">Чтобы вернуться к своей анкете, используйте тот же способ входа.</p><p class="form-error" id="oauth-error" role="alert"></p><p class="help">После входа можно заполнить анкету и предложить идеи. <a class="text-link" href="#/privacy">Как используются ваши данные</a></p></div></section>`;
}
async function profilePage() {
  if(!user)return heading('Анкета актёра','Расскажите о себе, чтобы организатор мог рассмотреть вашу кандидатуру.')+lock('Сначала создайте аккаунт','После входа вы сможете отправить анкету и вернуться к ней позже.');
  const app=await query(db.from('applications').select('*').eq('user_id',user.id).maybeSingle());
  return heading('Моя анкета','Прежний состав и новые участники — у каждого есть место в этой истории.')+
    `<div class="grid"><section class="panel"><form id="application-form" class="form"><div class="section-head"><h2>Участие в фильме</h2>${app?`<span class="status">${statusLabels[app.status]}</span>`:''}</div>${field('Имя и фамилия','display_name',{auto:'name',max:100,value:profile?.display_name || user.user_metadata?.display_name})}<div class="field-row">${field('Город','city',{max:100,value:app?.city})}<label class="field"><span>Снимались в прошлых частях?</span><select name="participation"><option value="new" ${app?.participation==='new'?'selected':''}>Нет, хочу присоединиться</option><option value="returning" ${app?.participation==='returning'?'selected':''}>Да, возвращаюсь в проект</option></select></label></div>${field('Прежняя или желаемая роль','role_name',{required:false,max:200,value:app?.role_name,placeholder:'Персонаж или «готов рассмотреть варианты»'})}${area('Опыт и немного о себе','experience',{max:5000,value:app?.experience})}${area('Готовность к съёмкам','availability',{max:2000,value:app?.availability,placeholder:'Когда можете участвовать? Есть ли ограничения по времени или поездкам?'})}${field('Контакт для организатора','contact',{max:200,value:app?.contact,placeholder:'Почта, телефон или Telegram'})}${field('Портфолио или видео (необязательно)','portfolio',{type:'url',required:false,max:500,value:app?.portfolio,placeholder:'https://…'})}<label class="check"><input type="checkbox" required><span>Можно связаться со мной по поводу участия. Если меня утвердят, моё имя и роль появятся в составе фильма.</span></label>${errors}<button class="button" type="submit">${app?'Сохранить анкету':'Отправить анкету'}</button></form></section><aside class="panel"><span class="eyebrow">Ваш аккаунт</span>${actorAvatar(profile?.display_name,profile?.avatar_url)}<p>${e(user.email || profile?.display_name || 'Участник Telegram')}</p><p class="help">Контакты, опыт и доступность видны только вам и организатору. Заполненная анкета не означает автоматического утверждения.</p>${app?`<hr><p class="status">${statusLabels[app.status]}</p><p class="help">${app.status==='accepted'?'Вы в составе! Если имя или роль нужно изменить, сообщите организатору.':app.status==='declined'?'В этот раз кандидатура не выбрана. Вы можете обновить анкету и связаться с организатором.':'Организатор рассмотрит вашу анкету и свяжется с вами.'}</p>`:''}<hr><button class="button secondary full" id="logout">Выйти из аккаунта</button></aside></div>`;
}
async function adminPage() {
  if(!user||!admin)return heading('Управление фильмом','Эта страница доступна организатору.')+'<a class="button secondary" href="#/cast">К актёрскому составу</a>';
  const [apps,chapters,chars]=await Promise.all([query(db.from('applications').select('*, profiles(display_name)').order('created_at',{ascending:false})),rows('lore_chapters','sort_order'),rows('characters','sort_order')]);
  return heading('Управление фильмом','Рассмотрите анкеты, опубликуйте лор и добавьте персонажей.')+`<div class="pill-nav"><a href="#admin-apps" data-scroll="admin-apps">Анкеты · ${apps.length}</a><a href="#admin-lore" data-scroll="admin-lore">Лор · ${chapters.length}</a><a href="#admin-characters" data-scroll="admin-characters">Персонажи · ${chars.length}</a></div><section id="admin-apps" class="admin-block"><div class="section-head"><h2>Анкеты актёров</h2></div>${apps.length?apps.map(a=>`<article class="admin-app"><h3>${e(a.profiles?.display_name || 'Участник')} <span class="status">${statusLabels[a.status]}</span></h3><p>${e(a.city)} · ${a.participation==='returning'?'Прежний состав':'Новый актёр'}</p><p><b>Роль:</b> ${e(a.role_name||'Не указана')}</p><p><b>Опыт:</b> ${e(a.experience)}</p><p><b>Готовность:</b> ${e(a.availability)}</p><p><b>Контакт:</b> ${e(a.contact)}</p>${a.portfolio?`<p><b>Портфолио:</b> ${safeUrl(a.portfolio)?`<a class="text-link" href="${e(a.portfolio)}" target="_blank" rel="noopener noreferrer">Открыть портфолио</a>`:e(a.portfolio)}</p>`:''}<div class="idea-actions"><button class="button small review" data-id="${a.id}" data-status="accepted">Утвердить</button><button class="button secondary small review" data-id="${a.id}" data-status="declined">Отклонить</button><button class="button secondary small review" data-id="${a.id}" data-status="submitted">На рассмотрение</button></div></article>`).join(''):empty('Анкет пока нет','Поделитесь ссылкой на сайт с прежними актёрами и кандидатами.')}</section><div class="admin-grid"><section class="panel admin-block" id="admin-lore"><h2>Лор трилогии</h2><form id="lore-form" class="form"><input type="hidden" name="id">${field('Название раздела','title',{max:200})}${field('Порядок раздела','sort_order',{type:'number',value:chapters.length+1})}${area('Текст раздела','content',{max:30000})}${errors}<button class="button">Сохранить раздел</button><button class="button secondary" type="reset">Очистить форму</button></form>${chapters.map(c=>`<div class="cast-card"><div><h3>${e(c.title)}</h3><button class="button secondary small edit-lore" data-id="${c.id}">Изменить</button></div></div>`).join('')}</section><section class="panel admin-block" id="admin-characters"><h2>Персонажи</h2><form id="character-form" class="form"><input type="hidden" name="id">${field('Имя персонажа','name',{max:200})}${field('Порядок карточки','sort_order',{type:'number',value:chars.length+1})}${area('Краткое описание','description',{max:5000})}${area('Характер','personality',{max:5000})}${area('Особенности','traits',{required:false,max:5000})}${area('Связи с героями','relationships',{required:false,max:5000})}${area('История в трилогии','history',{required:false,max:10000})}<label class="field"><span>Роль в финальном фильме</span><select name="casting_status"><option value="open">Нужен актёр</option><option value="cast">Актёр выбран</option><option value="uncertain">Участие уточняется</option></select></label>${errors}<button class="button">Сохранить персонажа</button><button class="button secondary" type="reset">Очистить форму</button></form>${chars.map(c=>`<div class="cast-card"><div><h3>${e(c.name)}</h3><button class="button secondary small edit-character" data-id="${c.id}">Изменить</button></div></div>`).join('')}</section></div>`;
}
function safeUrl(url){try{return ['https:','http:'].includes(new URL(url).protocol)}catch{return false}}
function privacyPage(){return heading('Ваши данные','Информация нужна для сбора команды и совместной работы над фильмом.')+`<div class="panel" style="max-width:800px"><h2>Что увидят другие</h2><p class="muted">Имя, роль и фото профиля утверждённых актёров доступны посетителям. Авторство и текст предложений по сюжету доступны зарегистрированным участникам. Лор и персонажи открыты всем.</p><h2>Что видит организатор</h2><p class="muted">Город, прежнее участие, опыт, готовность к съёмкам, контакт и ссылка на портфолио из анкеты. Другие участники не имеют доступа к этим полям.</p><h2>Аккаунт и удаление данных</h2><p class="muted">Имя и идентификатор аккаунта Google или Telegram используются для входа через Supabase. При входе через Google также используется почта. Пароли ваших аккаунтов сайт не получает; номер телефона и доступ к сообщениям Telegram не запрашиваются. Свои идеи можно удалить на странице обсуждения, анкету — исправить в личном кабинете. Для удаления аккаунта и анкеты обратитесь к организатору по известному вам контакту проекта.</p><p class="help">Перед публичным запуском организатору необходимо добавить сюда своё имя и контакт для запросов об удалении данных.</p></div>`}
async function submit(form,fn) {
  const button=form.querySelector('button[type="submit"],button:not([type])');button.disabled=true;
  form.querySelector('.form-error').textContent='';form.querySelector('.form-success').textContent='';
  try{await fn(Object.fromEntries(new FormData(form)));}catch(error){form.querySelector('.form-error').textContent=readableError(error);}finally{if(button.isConnected)button.disabled=false;}
}
async function loadIdentity() {
  if(!db)return;
  const {data:{session},error}=await db.auth.getSession();if(error)throw error;user=session?.user || null;admin=false;profile=null;
  if(user){const [p,admins]=await Promise.all([query(db.from('profiles').select('*').eq('id',user.id).maybeSingle()),query(db.from('admin_users').select('user_id').eq('user_id',user.id))]);profile=p;admin=admins.length>0;}
}
function wire(page){
  document.querySelectorAll('.avatar-photo').forEach(photo=>{
    photo.onerror=()=>photo.remove();
    if(photo.complete && !photo.naturalWidth)photo.remove();
  });
  const loginButtons=[...document.querySelectorAll('.oauth-login')];
  loginButtons.forEach(button=>button.onclick=async()=>{
    if(!configured || !db)return;
    loginButtons.forEach(item=>item.disabled=true);
    document.querySelector('#oauth-error').textContent='';
    try{
      const {error}=await db.auth.signInWithOAuth({provider:button.dataset.provider,options:{redirectTo:returnUrl()}});
      if(error)throw error;
    }catch(error){document.querySelector('#oauth-error').textContent=readableError(error);loginButtons.forEach(item=>item.disabled=false);}
  });

  const roleSelect=document.querySelector('#demo-role');
  if(roleSelect)roleSelect.onchange=async()=>{setDemoRole(roleSelect.value);await loadIdentity();render();};
  const reset=document.querySelector('#demo-reset');
  if(reset)reset.onclick=async()=>{if(!confirm('Удалить локальные изменения и вернуть тестовые данные?'))return;resetDemo();await loadIdentity();go('cast');toast('Тестовые данные восстановлены');};
  document.querySelectorAll('.demo-enter').forEach(button=>button.onclick=async()=>{setDemoRole(button.dataset.role);await loadIdentity();go(button.dataset.role==='organizer'?'admin':'profile');});

  document.querySelectorAll('[data-chapter]').forEach(a=>a.onclick=ev=>{ev.preventDefault();document.getElementById('chapter-'+a.dataset.chapter)?.scrollIntoView({behavior:'smooth'});});
  document.querySelectorAll('[data-scroll]').forEach(a=>a.onclick=ev=>{ev.preventDefault();document.getElementById(a.dataset.scroll)?.scrollIntoView({behavior:'smooth'});});
  const auth=document.querySelector('#auth-form');
  if(auth)auth.onsubmit=ev=>{ev.preventDefault();if(!db)return;submit(auth,async data=>{
    const mode=auth.dataset.mode;
    if(mode==='register'){
      const {data:result,error}=await db.auth.signUp({email:data.email.trim(),password:data.password,options:{data:{display_name:data.display_name.trim()},emailRedirectTo:returnUrl()}});if(error)throw error;
      if(result.session){await loadIdentity();go('profile');}else{auth.querySelector('.form-success').textContent='Проверьте почту: если регистрация доступна для этого адреса, вы получите письмо с подтверждением. Затем войдите.';auth.reset();}
    }else if(mode==='login'){
      const {error}=await db.auth.signInWithPassword({email:data.email.trim(),password:data.password});if(error)throw error;await loadIdentity();go('profile');
    }else if(mode==='forgot'){
      const {error}=await db.auth.resetPasswordForEmail(data.email.trim(),{redirectTo:returnUrl()});if(error)throw error;auth.querySelector('.form-success').textContent='Если аккаунт существует, ссылка для смены пароля придёт на почту.';
    }else{
      const {error}=await db.auth.updateUser({password:data.password});if(error)throw error;toast('Пароль сохранён');go('profile');
    }
  });};
  const application=document.querySelector('#application-form');
  if(application)application.onsubmit=ev=>{ev.preventDefault();submit(application,async data=>{
    await query(db.from('profiles').update({display_name:data.display_name.trim()}).eq('id',user.id));
    const payload={user_id:user.id,city:data.city.trim(),participation:data.participation,role_name:data.role_name.trim(),experience:data.experience.trim(),availability:data.availability.trim(),contact:data.contact.trim(),portfolio:data.portfolio.trim()};
    const existing=await query(db.from('applications').select('id').eq('user_id',user.id).maybeSingle());
    if(existing){delete payload.user_id;await query(db.from('applications').update(payload).eq('id',existing.id));}
    else await query(db.from('applications').insert(payload));
    await loadIdentity();toast('Анкета сохранена');render();
  });};
  const idea=document.querySelector('#idea-form');
  if(idea)idea.onsubmit=ev=>{ev.preventDefault();submit(idea,async data=>{await query(db.from('ideas').insert({user_id:user.id,title:data.title.trim(),content:data.content.trim()}));toast('Идея опубликована');render();});};
  document.querySelectorAll('.delete-idea').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить эту идею?'))return;b.disabled=true;try{await query(db.from('ideas').delete().eq('id',b.dataset.id));toast('Идея удалена');render();}catch(err){toast(readableError(err));b.disabled=false;}});
  const logout=document.querySelector('#logout');if(logout)logout.onclick=async()=>{logout.disabled=true;const {error}=await db.auth.signOut();if(error){toast(readableError(error));logout.disabled=false;return;}user=null;profile=null;admin=false;go('cast');};
  if(page==='admin'&&admin){
    document.querySelectorAll('.review').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await query(db.rpc('review_application',{application_id:b.dataset.id,new_status:b.dataset.status}));toast('Статус изменён');render();}catch(err){toast(readableError(err));b.disabled=false;}});
    for(const [formId,table,editClass] of [['lore-form','lore_chapters','edit-lore'],['character-form','characters','edit-character']]){
      const form=document.getElementById(formId);if(!form)continue;
      form.onsubmit=ev=>{ev.preventDefault();submit(form,async data=>{const id=data.id;delete data.id;data.sort_order=Number(data.sort_order);for(const key of Object.keys(data))if(typeof data[key]==='string')data[key]=data[key].trim();await query(id?db.from(table).update(data).eq('id',id):db.from(table).insert(data));toast('Материалы сохранены');render();});};
      document.querySelectorAll('.'+editClass).forEach(b=>b.onclick=async()=>{try{const item=await query(db.from(table).select('*').eq('id',b.dataset.id).single());for(const [key,val]of Object.entries(item)){const input=form.elements.namedItem(key);if(input)input.value=val??'';}form.scrollIntoView({behavior:'smooth'});form.elements[1].focus();}catch(err){toast(readableError(err));}});
    }
  }
}
window.addEventListener('hashchange',()=>render());
let authTimer;
if(db)db.auth.onAuthStateChange((event,session)=>{
  // Defer database calls outside the Supabase auth callback lock.
  if(event==='PASSWORD_RECOVERY'){location.hash='/reset';}
  if(event==='SIGNED_OUT'){user=null;admin=false;profile=null;render();return;}
  if(event==='SIGNED_IN'||event==='USER_UPDATED'){
    clearTimeout(authTimer);authTimer=setTimeout(async()=>{try{await loadIdentity();if(route()!=='reset')render();}catch(err){toast(readableError(err));}},0);
  }
});
try{await loadIdentity();}catch(err){toast(readableError(err));}
await render();
