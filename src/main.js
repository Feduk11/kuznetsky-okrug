import './styles.css';
import { uploadFiles, removeFiles, photoUrl, attachmentUrls, MediaError } from './media.js';
import { configured, demoMode, db, query, returnUrl, readableError } from './api.js';
import { project } from './project.js';
import { getDemoRole, setDemoRole, resetDemo } from './demo.js';

const root = document.querySelector('#app');
let user = null, admin = false, profile = null, revision = 0;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e = escape;
const openCommentThreads = new Set();
let notificationsOpen=false;
const statusLabels = {submitted:'На рассмотрении',accepted:'В составе',declined:'Не выбрана'};
const navs = [['cast','Актёрский состав'],['ideas','Идеи сюжета'],['lore','Лор трилогии'],['characters','Персонажи'],['roadmap','Дорожная карта']];
const route = () => location.hash.startsWith('#/') ? location.hash.slice(2).split('?')[0] || 'cast' : 'cast';
const sharedIdeaId = () => new URLSearchParams(location.hash.split('?')[1] || '').get('idea');
const ideaLink = id => location.origin + location.pathname + '#/ideas?idea=' + encodeURIComponent(id);
const pendingIdeaKey = 'final-chapter-shared-idea';
function rememberSharedIdea(){const id=sharedIdeaId();if(id)try{sessionStorage.setItem(pendingIdeaKey,JSON.stringify({id,time:Date.now()}));}catch{}}
function restoreSharedIdea(){
  if(!user || !['cast','login','register'].includes(route()))return;
  try{const saved=JSON.parse(sessionStorage.getItem(pendingIdeaKey));sessionStorage.removeItem(pendingIdeaKey);if(saved?.id && Date.now()-saved.time<1800000)location.hash='/ideas?idea='+encodeURIComponent(saved.id);}catch{}
}
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
  try{const parsed=new URL(url);if(parsed.protocol==='https:' || (demoMode&&parsed.protocol==='blob:'))photo=parsed.href;}catch{}
  return `<div class="avatar" aria-hidden="true"><span>${e(initials(name || 'Участник'))}</span>${photo?`<img class="avatar-photo" src="${e(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</div>`;
}
const date = value => new Date(value).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
function toast(message) { const el=document.querySelector('#toast');el.textContent=message;el.classList.add('visible');setTimeout(()=>el.classList.remove('visible'),4000); }
function frame(page) {
  const navScroll=document.querySelector('.nav')?.scrollLeft || 0;
  root.innerHTML=`<div class="shell">${demoMode?`<div class="demo-bar"><div><b>Локальный прототип</b><span>Тестовые данные · не канон трилогии</span></div><div class="demo-controls"><label for="demo-role">Смотреть как</label><select id="demo-role"><option value="guest" ${getDemoRole()==='guest'?'selected':''}>Гость</option><option value="actor" ${getDemoRole()==='actor'?'selected':''}>Актёр</option><option value="organizer" ${getDemoRole()==='organizer'?'selected':''}>Организатор и актёр</option></select><button id="demo-reset" type="button">Сбросить демо</button></div></div>`:''}<header class="header"><a class="brand" href="#/cast"><img src="${import.meta.env.BASE_URL}favicon.svg" alt=""><span>${e(project.title)}</span></a><nav class="nav" aria-label="Основная навигация">${navs.map(([id,label])=>`<a href="#/${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${label}</a>`).join('')}${admin?`<a href="#/admin" ${page==='admin'?'aria-current="page"':''}>Управление</a>`:''}</nav><a class="account" href="#/${user?'profile':'login'}">${user?'Мой профиль':'Войти'}</a></header><main id="main" tabindex="-1" class="content"><div class="topline"><b>III</b><span></span>${e(project.subtitle)}</div><div id="view" aria-busy="true"><div class="loading">Загружаем…</div></div></main><footer class="footer"><span>${e(project.title)} · ${demoMode?'Демо сохраняет изменения только в этом браузере':'Собираем команду заключительного фильма'}</span><a href="#/privacy">Как используются ваши данные</a></footer></div>`;
  document.querySelector('.nav').scrollLeft=navScroll;
}
async function rows(table,order='created_at') {
  if (!db) return [];
  return query(db.from(table).select(table==='cast_members'?'id,display_name,role_name,participation,created_at,avatar_url,avatar_path':'*').order(order,{ascending:table==='lore_chapters'||table==='characters'}));
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
    else if(page==='roadmap') html=roadmapPage();
    else if(['login','register','forgot','reset'].includes(page)) html=authPage(page);
    else if(page==='profile') html=await profilePage();
    else if(page==='admin') html=await adminPage();
    else if(page==='privacy') html=privacyPage();
    else html=heading('Страница не найдена','Вернитесь к актёрскому составу.')+'<a class="button" href="#/cast">К составу</a>';
    if(current!==revision) return;
    const view=document.querySelector('#view');view.innerHTML=html;view.setAttribute('aria-busy','false');
    wire(page);
    if(page==='ideas'&&sharedIdeaId()){
      const card=[...view.querySelectorAll('.idea[data-idea-id]')].find(item=>item.dataset.ideaId===sharedIdeaId());
      if(card){card.classList.add('idea-linked');card.scrollIntoView?.({block:'start',behavior:'auto'});card.focus({preventScroll:true});}
      else toast('Идея не найдена. Возможно, автор удалил её.');
    }
    document.title = `${navs.find(([id])=>id===page)?.[1] || ({profile:'Мой профиль',admin:'Управление',register:'Регистрация',login:'Вход',forgot:'Восстановление пароля',reset:'Новый пароль',privacy:'Ваши данные'}[page] || 'Страница')} — ${project.title}`;
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
    `<div class="metrics"><div class="metric"><span>Актёров в составе</span><strong>${cast.length}</strong></div><div class="metric"><span>Открытых ролей</span><strong>${open}</strong></div><div class="metric"><span>Лет после прошлых съёмок</span><strong>11</strong></div></div><div class="grid"><section class="panel"><div class="section-head"><h2>Команда фильма</h2><span>${cast.length} участников</span></div>${cast.length?cast.map(c=>`<article class="cast-card">${actorAvatar(c.display_name,photoUrl(c))}<div><h3>${e(c.display_name)}</h3><p>${e(c.role_name || 'Роль уточняется')}</p></div><span class="chip">${c.participation==='returning'?'Прежний состав':'Новый актёр'}</span></article>`).join(''):empty('Первый шаг — собрать команду','Здесь появятся актёры, чьё участие подтвердит организатор. Если вы снимались раньше или хотите присоединиться впервые, заполните анкету.','01')}</section><aside class="panel"><div class="aside-title"><h2>Присоединиться</h2><span class="chip">Открытый набор</span></div><p class="muted small">Прежним актёрам — сообщить, готовы ли вы вернуться.<br>Новым — рассказать о себе и выбрать желаемую роль.</p><p class="muted small">Если вы иногородний, но хотите принять участие, возможна ваша интеграция с помощью ИИ-монтажа.</p><a class="button full" href="#/${user?'profile':'register'}">${user?'Мой профиль':'Создать аккаунт'}</a><div class="steps"><div class="step"><b>01</b><div><h3>Расскажите о себе</h3><p>Ваш город и возможность участвовать в съёмках локально в НВКЗ.</p></div></div><div class="step"><b>02</b><div><h3>Познакомьтесь с историей</h3><p><a class="text-link" href="#/lore">Лор трилогии</a> и <a class="text-link" href="#/characters">персонажи</a> помогут найти свою роль.</p></div></div><div class="step"><b>03</b><div><h3><a class="step-idea-link" href="#/ideas">Предложите идею</a></h3><p>Обсудим, как завершить историю вместе. <a class="text-link" href="#/ideas">Идеи сюжета</a></p></div></div></div></aside></div><section class="archive-block" aria-labelledby="archive-title"><h2 id="archive-title">Две первые серии</h2><div class="archive-previews"><img src="${import.meta.env.BASE_URL}previous-films.png" alt="Превью второй и первой серий «Кузнецкого округа», снятых 11 лет назад" width="437" height="169" loading="lazy"><a class="archive-link episode-second" href="${e(project.episodes.second)}" target="_blank" rel="noopener noreferrer" aria-label="Смотреть вторую серию «Кузнецкого округа» на YouTube — откроется в новой вкладке"></a><a class="archive-link episode-first" href="${e(project.episodes.first)}" target="_blank" rel="noopener noreferrer" aria-label="Смотреть первую серию «Кузнецкого округа» на YouTube — откроется в новой вкладке"></a></div></section>`;
}
function roadmapPage(){
  return heading('Дорожная карта','От сбора команды до финальных титров.\nЧетыре этапа, чтобы завершить историю вместе.') + `<section class="roadmap-page" aria-label="План работы над фильмом"><svg class="roadmap-symbols" aria-hidden="true"><defs>
<symbol id="roadmap-clapper" viewBox="0 0 24 24"><path d="M3 10h18v11H3zM3 5l17-3 1 5-17 3zM8 4l3 4M15 3l3 4"/></symbol>
<symbol id="roadmap-leaf" viewBox="0 0 24 24"><path d="M20 3C10 2 3 7 4 14c1 7 11 8 15 1 2-4 1-8 1-12ZM3 21 16 8M9 15v-5M9 15h6"/></symbol>
<symbol id="roadmap-snow" viewBox="0 0 24 24"><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4M21 14l-4 1 1 4M3 14l4 1-1 4M21 10l-4-1 1-4"/></symbol>
<symbol id="roadmap-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></symbol>
<symbol id="roadmap-play" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/></symbol>
<symbol id="roadmap-arrow" viewBox="0 0 24 24"><path d="M4 12h16M14 6l6 6-6 6"/></symbol>
</defs></svg><div class="roadmap-overview"><svg aria-hidden="true"><use href="#roadmap-play"/></svg><div><span>Планируемый релиз</span><strong>Лето 2027</strong></div><div class="roadmap-period">Осень 2026 → лето 2027<br>Команда · сценарий · съёмки · монтаж</div></div>
<ol class="roadmap-timeline" aria-label="Этапы работы над фильмом">
<li class="roadmap-stage roadmap-autumn"><div class="roadmap-stage-top"><div class="roadmap-season"><svg aria-hidden="true"><use href="#roadmap-leaf"/></svg><span>Осень 2026</span></div><span class="roadmap-step" aria-label="Этап 1">01</span></div><h2>Собрать команду<br>и написать сценарий</h2><p>Собираем прежних и новых актёров, обсуждаем идеи и создаём сценарий заключительного фильма.</p><div class="roadmap-tags"><span class="roadmap-tag">Сбор каста</span><span class="roadmap-tag">Создание сценария</span></div><div class="roadmap-stage-bottom"><svg aria-hidden="true"><use href="#roadmap-arrow"/></svg>Готовим основу для съёмок</div></li>
<li class="roadmap-stage roadmap-winter"><div class="roadmap-stage-top"><div class="roadmap-season"><svg aria-hidden="true"><use href="#roadmap-snow"/></svg><span>Зима 2026–2027</span></div><span class="roadmap-step" aria-label="Этап 2">02</span></div><h2>Снять зимние сцены</h2><p>Снимаем зимнюю часть фильма — завязку, с которой начнётся заключительная история.</p><div class="roadmap-tags"><span class="roadmap-tag">Зимние съёмки</span><span class="roadmap-tag">Завязка</span></div><div class="roadmap-stage-bottom"><svg aria-hidden="true"><use href="#roadmap-arrow"/></svg>Запускаем события финального фильма</div></li>
<li class="roadmap-stage roadmap-shooting"><div class="roadmap-stage-top"><div class="roadmap-season"><svg aria-hidden="true"><use href="#roadmap-sun"/></svg><span>Весна — лето 2027</span></div><span class="roadmap-step" aria-label="Этап 3">03</span></div><h2>Снять развязку<br>и собрать фильм</h2><p>Снимаем летние сцены и развязку. Монтируем отснятый материал в заключительный фильм трилогии.</p><div class="roadmap-tags"><span class="roadmap-tag">Летние съёмки</span><span class="roadmap-tag">Развязка</span><span class="roadmap-tag">Монтаж</span></div><div class="roadmap-stage-bottom"><svg aria-hidden="true"><use href="#roadmap-arrow"/></svg>Готовим финальную версию к релизу</div></li>
<li class="roadmap-stage roadmap-release"><div class="roadmap-stage-top"><div class="roadmap-season"><svg aria-hidden="true"><use href="#roadmap-play"/></svg><span>Лето 2027</span></div><span class="roadmap-step" aria-label="Этап 4">04</span></div><h2>Выпустить финал</h2><p>Релиз заключительного фильма. История «Кузнецкого округа» получает своё завершение.</p><div class="roadmap-tags"><span class="roadmap-tag">Релиз</span><span class="roadmap-tag">Финал трилогии</span></div><div class="roadmap-stage-bottom"><svg aria-hidden="true"><use href="#roadmap-clapper"/></svg>Встречаемся по ту сторону титров</div></li>
</ol>
<p class="roadmap-footnote">Съёмки, монтаж и релиз частично приходятся на одно лето. Точные даты уточним по готовности команды и фильма.</p>
</section>`;
}
async function lorePage() {
  const chapters=await rows('lore_chapters','sort_order');
  return (chapters.length?`<div class="lore-content">${chapters.map((c,i)=>`<article class="chapter" id="chapter-${e(c.id)}"><h2>${e(c.title)}</h2><div class="prose">${e(c.content)}</div></article>`).join('')}</div>`:`<div class="content-empty">${empty('Историю скоро добавим','Организатор опубликует пересказ прошлых частей и правила мира. Здесь будет канон трилогии, на который можно опираться в новых идеях.','I / II / III')}${admin?'<p><a class="button secondary" href="#/admin">Добавить раздел</a></p>':''}</div>`);
}
async function charactersPage() {
  const [chars,links]=await Promise.all([rows('characters','sort_order'),rows('character_actors','character_id')]);
  const actors=new Map(links.map(link=>[link.character_id,link.display_name]));
  return heading('Персонажи','Характеры, связи, особенности и роли в заключительном фильме.')+
    (chars.length?`<div class="cards">${chars.map((c,i)=>`<article class="character"><div class="index"><span>${String(i+1).padStart(2,'0')}</span><span class="chip ${c.casting_status==='cast'?'chip-cast':''}">${c.casting_status==='open'?'Нужен актёр':c.casting_status==='cast'?'✓ Актёр выбран':'Участие уточняется'}</span></div><h2>${e(c.name)}</h2>${actors.has(c.id)?`<p class="character-actor">Актёр: ${e(actors.get(c.id))}</p>`:''}<p>${e(c.description)}</p><details><summary>Характер и история</summary>${[['Характер',c.personality],['Особенности',c.traits],['Связи с героями',c.relationships],['История в трилогии',c.history]].filter(([,v])=>v).map(([label,value])=>`<div class="detail-line"><strong>${e(label)}</strong>${e(value)}</div>`).join('')}</details>${c.casting_status==='open'?`<p><a class="text-link" href="#/${user?'profile':'register'}">Подать анкету на эту роль</a></p>`:''}</article>`).join('')}</div>`:`<div class="content-empty">${empty('Каталог героев ещё не заполнен','Здесь появится отдельная карточка каждого персонажа: его характер, особенности, история и связи с другими героями.','CAST')}${admin?'<p><a class="button secondary" href="#/admin">Добавить персонажа</a></p>':''}</div>`);
}
const actionIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${name==='edit'?'<path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/>':name==='trash'?'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>':'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3M9 14l6 3"/>'}</svg>`;
const attachmentInput = label => `<label class="field"><span>${e(label)}</span><input type="file" name="attachments" multiple accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav"></label><span class="help">До 6 файлов: картинки до 8 МБ, музыка до 20 МБ.</span>`;
const attachmentRemoval = attachments => attachments?.length?`<fieldset class="edit-attachments"><legend>Прикреплённые файлы</legend>${attachments.map(a=>`<label class="check"><input type="checkbox" class="remove-attachment" value="${e(a.path)}"><span>Удалить: ${e(a.name)}</span></label>`).join('')}</fieldset>`:'';
async function ideasPage() {
  let html=heading('Как закончится история?','Предложения участников по сюжету заключительного фильма.');
  if(!db)return html+offline()+empty('Идеи скоро появятся','Организатор подключает базу сайта.');
  if(!user)rememberSharedIdea();
  const [ideas,comments]=await Promise.all([
    query(db.from(user?'ideas':'public_ideas').select(user?'*, profiles(display_name,avatar_url,avatar_path)':'*').order('created_at',{ascending:false})),
    query(db.from(user?'idea_comments':'public_idea_comments').select(user?'*, profiles(display_name,avatar_url,avatar_path)':'*').order('created_at',{ascending:true}))
  ]);
  const mediaUrls=await attachmentUrls([...ideas,...comments]);
  const media=idea=>`<div class="idea-media">${(idea.attachments||[]).map(a=>{const url=mediaUrls.get(a.path);return url?(a.kind==='image'?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer"><img src="${e(url)}" alt="${e(a.name)}" loading="lazy"></a>`:`<div class="idea-audio"><span>${e(a.name)}</span><audio controls preload="none" src="${e(url)}"></audio></div>`):`<p class="help">${e(a.name)} — файл недоступен. Обновите страницу.</p>`;}).join('')}</div>`;
  const editor=idea=>idea.user_id===user?.id?`<form class="form idea-edit" data-id="${e(idea.id)}" hidden><h3>Редактировать идею</h3>${field('Название','title',{max:160,value:idea.title})}${area('Идея сюжета','content',{max:10000,value:idea.content})}${(idea.attachments||[]).length?`<fieldset class="edit-attachments"><legend>Прикреплённые файлы</legend>${idea.attachments.map(a=>`<label class="check"><input type="checkbox" class="remove-attachment" value="${e(a.path)}"><span>Удалить: ${e(a.name)}</span></label>`).join('')}</fieldset>`:''}<label class="field"><span>Добавить картинки или музыку</span><input type="file" name="attachments" multiple accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav"></label><span class="help">До 6 файлов в идее. Картинки — до 8 МБ, музыка — до 20 МБ.</span>${errors}<div class="idea-actions"><button class="button small" type="submit">Сохранить изменения</button><button class="button secondary small cancel-edit-idea" type="button">Отмена</button></div></form>`:'';
  const sharing=idea=>{
    const url=ideaLink(idea.id),text=idea.title;
    return `<div class="idea-share"><div class="share-panel" id="share-${e(idea.id)}" hidden><label class="field"><span>Ссылка на идею</span><input class="share-url" readonly value="${e(url)}" aria-label="Ссылка на идею"></label><div class="idea-actions"><button type="button" class="button secondary small copy-idea-link">Скопировать</button><a class="button secondary icon-button" aria-label="Поделиться в Telegram" title="Telegram" href="https://t.me/share/url?${e(new URLSearchParams({url,text}).toString())}" target="_blank" rel="noopener noreferrer">${loginIcons.telegram}</a><a class="button secondary icon-button" aria-label="Поделиться в ВК" title="ВК" href="https://vk.com/share.php?${e(new URLSearchParams({url,title:text}).toString())}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#0077ff"/><path fill="white" d="M4 7h3c.2 4 1.7 5.8 2.8 6V7h2.8v3.5c1.1-.1 2.2-1.7 2.6-3.5H18c-.3 2.2-1.8 3.9-2.8 4.6 1 .6 2.8 2.1 3.4 4.4h-3c-.5-1.8-1.6-3.2-3-3.4V16h-.4C7 16 4.4 12.5 4 7Z"/></svg></a></div><p class="help">Ссылка доступна всем, даже без входа.</p><p class="share-status" role="status"></p></div></div>`;
  };
  const threads=new Map();
  for(const comment of comments){if(!threads.has(comment.idea_id))threads.set(comment.idea_id,[]);threads.get(comment.idea_id).push(comment);}
  const commentEditor=c=>c.user_id===user?.id?`<form class="form comment-edit" data-id="${e(c.id)}" data-idea-id="${e(c.idea_id)}" hidden><h3>Редактировать комментарий</h3>${area('Комментарий','content',{max:2000,value:c.content})}${attachmentRemoval(c.attachments)}${attachmentInput('Добавить картинки или музыку')}${errors}<div class="idea-actions"><button type="submit" class="button small">Сохранить</button><button type="button" class="button secondary small cancel-edit-comment">Отмена</button></div></form>`:'';
  const discussion=idea=>{
    const thread=threads.get(idea.id)||[];
    return `<details class="idea-comments" data-idea-id="${e(idea.id)}" ${openCommentThreads.has(idea.id)?'open':''}><summary>Комментарии <span class="comment-count">${thread.length}</span></summary><div class="comment-list">${thread.length?thread.map(c=>`<article class="idea-comment"><div class="idea-meta"><div class="idea-author">${actorAvatar(c.profiles?.display_name||'Участник',photoUrl(c.profiles))}<span>${e(c.profiles?.display_name||'Участник')}</span></div><span>·</span><time datetime="${e(c.created_at)}">${e(date(c.created_at))}</time></div><p>${e(c.content)}</p>${media(c)}<div class="comment-actions">${c.user_id===user?.id?`<button type="button" class="button secondary icon-button edit-comment" data-id="${e(c.id)}" aria-label="Редактировать комментарий" title="Редактировать комментарий">${actionIcon('edit')}</button>`:''}${c.user_id===user?.id||admin?`<button type="button" class="button secondary icon-button delete-comment" data-id="${e(c.id)}" data-idea-id="${e(idea.id)}" aria-label="Удалить комментарий" title="Удалить комментарий">${actionIcon('trash')}</button>`:''}</div>${commentEditor(c)}</article>`).join(''):'<p class="comment-empty">Пока нет комментариев. Начните обсуждение.</p>'}</div>${user?`<form class="form comment-form" data-idea-id="${e(idea.id)}">${area('Ваш комментарий','content',{max:2000,placeholder:'Что думаете об этой идее?'})}${attachmentInput('Картинки и музыка (необязательно)')}${errors}<button class="button small" type="submit">Отправить комментарий</button><span class="help">До 2000 символов. Комментарий и файлы будут видны всем.</span></form>`:`<p class="help"><a class="text-link idea-login" href="#/login" data-id="${e(idea.id)}">Войдите</a>, чтобы оставить комментарий.</p>`}</details>`;
  };
  const mobile=window.matchMedia?.('(max-width:720px)').matches || false;
  return html+`<div class="grid ideas-grid"><aside class="panel idea-composer"><details class="idea-proposal" ${mobile?'':'open'}><summary>Предложить идею <span aria-hidden="true">＋</span></summary><div class="proposal-body">${user?`<form id="idea-form" class="form"><h2>Предложить идею</h2>${field('Название','title',{max:160,placeholder:'О чём ваша идея?'})}${area('Идея сюжета','content',{max:10000,placeholder:'События, герои и то, как это связано с прошлыми частями…'})}<label class="field"><span>Картинки и музыка (необязательно)</span><input type="file" name="attachments" multiple accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav"></label><p class="help">До 6 файлов: JPG, PNG, WebP — до 8 МБ; MP3, M4A, OGG, WAV — до 20 МБ. Файлы доступны всем посетителям.</p>${errors}<button class="button" type="submit">Опубликовать идею</button><span class="help">Ваше имя, предложение и вложения будут видны всем.</span></form>`:lock('Предложите свою идею','Войдите, чтобы публиковать идеи и участвовать в обсуждении.')}</div></details></aside><section class="ideas-list">${ideas.length?ideas.map(i=>`<article class="idea" data-idea-id="${e(i.id)}" tabindex="-1"><div class="idea-meta"><div class="idea-author">${actorAvatar(i.profiles?.display_name || 'Участник',photoUrl(i.profiles))}<span>${e(i.profiles?.display_name || 'Участник')}</span></div><span>·</span><time datetime="${e(i.created_at)}">${e(date(i.created_at))}</time></div><h2>${e(i.title)}</h2><p>${e(i.content)}</p>${media(i)}<div class="idea-toolbar"><button type="button" class="button secondary small share-toggle" aria-expanded="false" aria-controls="share-${e(i.id)}">${actionIcon('share')}<span>Поделиться</span></button>${i.user_id===user?.id?`<button type="button" class="button secondary icon-button edit-idea" data-id="${e(i.id)}" aria-label="Редактировать идею" title="Редактировать идею">${actionIcon('edit')}</button>`:''}${i.user_id===user?.id||admin?`<button type="button" class="button secondary icon-button delete-idea" data-id="${e(i.id)}" aria-label="Удалить идею" title="Удалить идею">${actionIcon('trash')}</button>`:''}</div>${sharing(i)}${editor(i)}${discussion(i)}</article>`).join(''):empty('Первая идея может быть вашей','Что стало с героями за одиннадцать лет? Какую историю хочется завершить? Предложите свою версию финала.','III')}</section></div>`;
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
const assignedCharacterForm=c=>`<details class="profile-character"><summary>${e(c.name)}</summary><form class="form assigned-character-form" data-id="${e(c.id)}">${field('Имя персонажа','name',{max:200,value:c.name})}${area('Краткое описание','description',{max:5000,value:c.description})}${area('Характер','personality',{max:5000,value:c.personality})}${area('Особенности','traits',{required:false,max:5000,value:c.traits})}${area('Связи с героями','relationships',{required:false,max:5000,value:c.relationships})}${area('История','history',{required:false,max:10000,value:c.history})}${errors}<button class="button" type="submit">Сохранить персонажа</button><span class="help">Изменения появятся в публичной карточке персонажа.</span></form></details>`;
function notificationInbox(messages){
 const unread=messages.filter(n=>!n.read_at).length;
 return `<details class="notification-inbox" ${notificationsOpen?'open':''}><summary aria-label="Уведомления: ${unread} непрочитанных"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 20h4"/></svg><span>Уведомления</span><b class="notification-count">${unread}</b></summary><div class="notification-list"><button class="button secondary small refresh-notifications" type="button">Обновить</button>${messages.length?messages.map(n=>`<article class="notification-message ${n.read_at?'':'unread'}"><div class="idea-meta"><span>Организатор</span><time datetime="${e(n.created_at)}">${e(date(n.created_at))}</time></div><h3>${e(n.title)}</h3><p>${e(n.message)}</p>${n.read_at?'<span class="help">Прочитано</span>':`<button type="button" class="button secondary small read-notification" data-id="${e(n.id)}">Отметить прочитанным</button>`}</article>`).join(''):'<p class="help">Сообщений пока нет.</p>'}<p class="help">Новые сообщения появятся после обновления.</p></div></details>`;
}
async function profilePage() {
  if(!user)return heading('Анкета актёра','Расскажите о себе, чтобы организатор мог рассмотреть вашу кандидатуру.')+lock('Сначала создайте аккаунт','После входа вы сможете отправить анкету и вернуться к ней позже.');
  const [app,assignments,chars,messages,telegram]=await Promise.all([
    query(db.from('applications').select('*').eq('user_id',user.id).maybeSingle()),
    query(db.from('character_assignments').select('*').eq('user_id',user.id)),rows('characters','sort_order'),
    query(db.from('notifications').select('*').eq('recipient_id',user.id).order('created_at',{ascending:false})),
    query(db.from('telegram_connections').select('user_id,enabled,connected_at').eq('user_id',user.id).maybeSingle())
  ]);
  const assigned=new Set(assignments.map(a=>a.character_id));
  const personalCharacters=chars.filter(c=>assigned.has(c.id));
  return heading('Мой профиль','Измените данные и нажмите «Сохранить анкету».',notificationInbox(messages))+
    `<div class="grid"><section class="panel"><form id="application-form" class="form"><div class="section-head"><h2>Участие в фильме</h2>${app?`<span class="status">${statusLabels[app.status]}</span>`:''}</div>${field('Имя и фамилия','display_name',{auto:'name',max:100,value:profile?.display_name || user.user_metadata?.display_name})}<div class="field-row">${field('Город','city',{max:100,value:app?.city})}<label class="field"><span>Снимались в прошлых частях?</span><select name="participation"><option value="new" ${app?.participation==='new'?'selected':''}>Нет, хочу присоединиться</option><option value="returning" ${app?.participation==='returning'?'selected':''}>Да, возвращаюсь в проект</option></select></label></div>${field('Прежняя или желаемая роль','role_name',{required:false,max:200,value:app?.role_name,placeholder:'Персонаж или «готов рассмотреть варианты»'})}${area('Опыт и немного о себе (необязательно)','experience',{required:false,max:5000,value:app?.experience})}${area('Готовность к съёмкам (необязательно)','availability',{required:false,max:2000,value:app?.availability,placeholder:'Когда можете участвовать? Есть ли ограничения по времени или поездкам?'})}${field('Контакт для организатора (необязательно)','contact',{required:false,max:200,value:app?.contact,placeholder:'Почта, телефон или Telegram'})}${errors}<button class="button" type="submit">${app?'Сохранить анкету':'Отправить анкету'}</button></form></section><aside class="panel"><span class="eyebrow">Ваш аккаунт</span>${actorAvatar(profile?.display_name,photoUrl(profile))}<form id="avatar-form" class="form avatar-form"><label class="field"><span>Фото профиля</span><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required></label><span class="help">${demoMode?'В демо загруженные файлы доступны до перезагрузки страницы. ':''}JPG, PNG или WebP, до 5 МБ. Фото утверждённого актёра видно всем.</span>${errors}<button class="button secondary small" type="submit">Загрузить аватарку</button></form><p>${e(user.email || profile?.display_name || 'Участник Telegram')}</p><p class="help">Контакты, опыт и доступность видны только вам и организатору. Заполненная анкета не означает автоматического утверждения.</p>${app?`<hr><p class="status">${statusLabels[app.status]}</p><p class="help">${app.status==='accepted'?'Вы в составе! Вы можете редактировать анкету; имя и роль обновятся в составе после сохранения.':app.status==='declined'?'В этот раз кандидатура не выбрана. Вы можете обновить анкету и связаться с организатором.':'Организатор рассмотрит вашу анкету и свяжется с вами.'}</p>`:''}<hr><div class="telegram-settings"><h3>Уведомления в Telegram</h3><p class="help">${telegram?.enabled?'Подключены. Сообщения организатора будут приходить и в личку бота.':'Откройте бота по кнопке ниже и нажмите «Запустить», чтобы получать сообщения организатора.'}</p>${telegram?.enabled?'<button type="button" class="button secondary full" id="disconnect-telegram">Отключить Telegram</button>':'<button type="button" class="button secondary full" id="connect-telegram">Подключить Telegram</button><a class="button full" id="telegram-connect-link" hidden target="_blank" rel="noopener noreferrer">Открыть бота</a>'}<button type="button" class="text-link" id="refresh-telegram">Проверить подключение</button><p class="help" id="telegram-settings-status" role="status"></p></div><hr><button class="button secondary full" id="logout">Выйти из аккаунта</button></aside></div><section class="panel profile-characters"><h2>Мои персонажи</h2>${personalCharacters.length?personalCharacters.map(assignedCharacterForm).join(''):'<p class="help">Здесь появятся персонажи, которых за вами закрепит организатор.</p>'}</section>`;
}
async function adminPage() {
  if(!user||!admin)return heading('Управление фильмом','Эта страница доступна организатору.')+'<a class="button secondary" href="#/cast">К актёрскому составу</a>';
  const [apps,chapters,chars,assignments,profiles]=await Promise.all([query(db.from('applications').select('*, profiles(display_name)').order('created_at',{ascending:false})),rows('lore_chapters','sort_order'),rows('characters','sort_order'),query(db.from('character_assignments').select('*')),query(db.from('profiles').select('id,display_name').order('display_name'))]);
  const assignedActors=new Map(assignments.map(a=>[a.character_id,a.user_id]));
  const actorOptions=apps.filter(a=>a.status==='accepted');
  return heading('Управление фильмом','Рассмотрите анкеты, опубликуйте лор и добавьте персонажей.')+`<div class="pill-nav"><a href="#admin-apps" data-scroll="admin-apps">Анкеты · ${apps.length}</a><a href="#admin-lore" data-scroll="admin-lore">Лор · ${chapters.length}</a><a href="#admin-characters" data-scroll="admin-characters">Персонажи · ${chars.length}</a></div><section id="admin-apps" class="admin-block"><div class="section-head"><h2>Анкеты актёров</h2></div>${apps.length?apps.map(a=>`<article class="admin-app"><h3>${e(a.profiles?.display_name || 'Участник')} <span class="status">${statusLabels[a.status]}</span></h3><p>${e(a.city)} · ${a.participation==='returning'?'Прежний состав':'Новый актёр'}</p><p><b>Роль:</b> ${e(a.role_name||'Не указана')}</p><p><b>Опыт:</b> ${e(a.experience)}</p><p><b>Готовность:</b> ${e(a.availability)}</p><p><b>Контакт:</b> ${e(a.contact)}</p><div class="idea-actions"><button class="button small review" data-id="${a.id}" data-status="accepted">Утвердить</button><button class="button secondary small review" data-id="${a.id}" data-status="declined">Отклонить</button><button class="button secondary small review" data-id="${a.id}" data-status="submitted">На рассмотрение</button></div></article>`).join(''):empty('Анкет пока нет','Поделитесь ссылкой на сайт с прежними актёрами и кандидатами.')}</section><div class="admin-grid"><section class="panel admin-block" id="admin-lore"><h2>Лор трилогии</h2><form id="lore-form" class="form"><input type="hidden" name="id">${field('Название раздела','title',{max:200})}${field('Порядок раздела','sort_order',{type:'number',value:chapters.length+1})}${area('Текст раздела','content',{max:30000})}${errors}<button class="button">Сохранить раздел</button><button class="button secondary" type="reset">Очистить форму</button></form>${chapters.map(c=>`<div class="cast-card"><div><h3>${e(c.title)}</h3><button class="button secondary small edit-lore" data-id="${c.id}">Изменить</button></div></div>`).join('')}</section><section class="panel admin-block" id="admin-characters"><h2>Персонажи</h2><form id="character-form" class="form"><input type="hidden" name="id">${field('Имя персонажа','name',{max:200})}${field('Порядок карточки','sort_order',{type:'number',value:chars.length+1})}${area('Краткое описание','description',{max:5000})}${area('Характер','personality',{max:5000})}${area('Особенности','traits',{required:false,max:5000})}${area('Связи с героями','relationships',{required:false,max:5000})}${area('История в трилогии','history',{required:false,max:10000})}<label class="field"><span>Роль в финальном фильме</span><select name="casting_status"><option value="open">Нужен актёр</option><option value="cast">Актёр выбран</option><option value="uncertain">Участие уточняется</option></select></label>${errors}<button class="button">Сохранить персонажа</button><button class="button secondary" type="reset">Очистить форму</button></form>${chars.map(c=>`<div class="cast-card"><div><h3>${e(c.name)}</h3><button class="button secondary small edit-character" data-id="${c.id}">Изменить</button></div></div>`).join('')}</section></div><section class="panel admin-block" id="admin-assignments"><h2>Актёры и персонажи</h2><p class="help">Выберите актёра из утверждённого состава. Он сможет редактировать карточку персонажа в своём профиле. За актёром можно закрепить несколько персонажей.</p>${chars.map(c=>`<form class="form assignment-form" data-id="${e(c.id)}"><h3>${e(c.name)}</h3><label class="field"><span>Актёр</span><select name="actor_user"><option value="">Не назначен</option>${actorOptions.map(a=>`<option value="${e(a.user_id)}" ${assignedActors.get(c.id)===a.user_id?'selected':''}>${e(a.profiles?.display_name||'Участник')}</option>`).join('')}</select></label>${errors}<button class="button secondary small" type="submit">Сохранить назначение</button></form>`).join('')}</section><section class="panel admin-block" id="admin-notifications"><h2>Отправить уведомление</h2><div class="telegram-admin"><button type="button" class="button secondary small" id="setup-telegram">Настроить бота</button><button type="button" class="button secondary small" id="retry-telegram">Повторить / дослать в Telegram</button><p class="help" id="telegram-admin-status" role="status"></p></div><form id="notification-form" class="form"><label class="field"><span>Кому</span><select name="recipient_user"><option value="">Всем участникам</option>${profiles.map(p=>`<option value="${e(p.id)}">${e(p.display_name)}</option>`).join('')}</select></label>${field('Заголовок','title_text',{max:120})}${area('Сообщение','message_text',{max:5000,placeholder:'Обновления сайта, время и место сбора на съёмки…'})}${errors}<button class="button" type="submit">Отправить уведомление</button><span class="help">Сообщение появится на сайте и отправится в Telegram, если получатель подключил бота.</span></form></section>`;
}
function safeUrl(url){try{return ['https:','http:'].includes(new URL(url).protocol)}catch{return false}}
function privacyPage(){return heading('Ваши данные','Информация нужна для сбора команды и совместной работы над фильмом.')+`<div class="panel" style="max-width:800px"><h2>Что увидят другие</h2><p class="muted">Имя, роль и фото профиля утверждённых актёров доступны посетителям. Идеи, комментарии, вложения и имена их авторов доступны всем посетителям. Лор и персонажи открыты всем.</p><h2>Что видит организатор</h2><p class="muted">Город, прежнее участие, опыт, готовность к съёмкам, контакт из анкеты. Другие участники не имеют доступа к этим полям.</p><h2>Аккаунт и удаление данных</h2><p class="muted">Имя и идентификатор аккаунта Google или Telegram используются для входа через Supabase. При входе через Google также используется почта. Пароли ваших аккаунтов сайт не получает; номер телефона и доступ к сообщениям Telegram не запрашиваются. Свои идеи и комментарии можно удалить на странице обсуждения, анкету — исправить в личном кабинете. Для удаления аккаунта и анкеты обратитесь к организатору по известному вам контакту проекта.</p><p class="help">Перед публичным запуском организатору необходимо добавить сюда своё имя и контакт для запросов об удалении данных.</p></div>`}
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
    const payload={user_id:user.id,city:data.city.trim(),participation:data.participation,role_name:data.role_name.trim(),experience:data.experience.trim(),availability:data.availability.trim(),contact:data.contact.trim()};
    const existing=await query(db.from('applications').select('id').eq('user_id',user.id).maybeSingle());
    if(existing){delete payload.user_id;await query(db.from('applications').update(payload).eq('id',existing.id));}
    else await query(db.from('applications').insert(payload));
    await loadIdentity();toast('Анкета сохранена');render();
  });};
  const avatar=document.querySelector('#avatar-form');
  if(avatar)avatar.onsubmit=ev=>{ev.preventDefault();submit(avatar,async()=>{
    const old=profile?.avatar_path;
    const files=await uploadFiles([...avatar.elements.avatar.files],user.id,true);
    if(!files.length)throw new Error('Выберите фото.');
    try{await query(db.rpc('set_avatar',{object_path:files[0].path}));}
    catch(error){await removeFiles('avatars',files.map(f=>f.path));throw error;}
    if(old)await removeFiles('avatars',[old]);
    await loadIdentity();toast('Аватарка обновлена');await render();
  });};
  const idea=document.querySelector('#idea-form');
  if(idea)idea.onsubmit=ev=>{ev.preventDefault();submit(idea,async data=>{
    const attachments=await uploadFiles([...idea.elements.attachments.files],user.id);
    try{await query(db.from('ideas').insert({user_id:user.id,title:data.title.trim(),content:data.content.trim(),attachments}));}
    catch(error){await removeFiles('idea-media',attachments.map(a=>a.path));throw error;}
    toast('Идея опубликована');await render();
  });};
  document.querySelectorAll('.idea-login').forEach(link=>link.onclick=()=>{try{sessionStorage.setItem(pendingIdeaKey,JSON.stringify({id:link.dataset.id,time:Date.now()}));}catch{}});
  document.querySelectorAll('.share-toggle').forEach(button=>button.onclick=()=>{const panel=button.closest('.idea').querySelector('.share-panel');panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));});
  document.querySelectorAll('.share-url').forEach(input=>input.onclick=()=>input.select());
  document.querySelectorAll('.copy-idea-link').forEach(button=>button.onclick=async()=>{
    const panel=button.closest('.share-panel'),input=panel.querySelector('.share-url'),status=panel.querySelector('.share-status');
    button.disabled=true;status.textContent='';
    try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(input.value);status.textContent='Ссылка скопирована';}
    catch{input.focus();input.select();status.textContent='Выделенная ссылка готова к копированию. Скопируйте её вручную.';}
    finally{button.disabled=false;}
  });
  document.querySelectorAll('.edit-idea').forEach(button=>button.onclick=()=>{
    const form=button.closest('.idea').querySelector('.idea-edit');form.hidden=false;button.hidden=true;form.elements.title.focus();
  });
  document.querySelectorAll('.cancel-edit-idea').forEach(button=>button.onclick=()=>{
    const form=button.closest('form');form.reset();form.querySelector('.form-error').textContent='';form.hidden=true;form.closest('.idea').querySelector('.edit-idea').hidden=false;
  });
  document.querySelectorAll('.idea-edit').forEach(form=>form.onsubmit=ev=>{
    ev.preventDefault();submit(form,async data=>{
      const current=await query(db.from('ideas').select('*').eq('id',form.dataset.id).single());
      if(current.user_id!==user.id)throw new MediaError('Редактировать можно только свою идею.');
      const removed=new Set([...form.querySelectorAll('.remove-attachment:checked')].map(input=>input.value));
      const kept=(current.attachments||[]).filter(a=>!removed.has(a.path));
      const files=[...form.elements.attachments.files];
      if(kept.length+files.length>6)throw new MediaError('В идее может быть до 6 файлов. Удалите лишние вложения.');
      const uploaded=await uploadFiles(files,user.id);
      try{await query(db.from('ideas').update({title:data.title.trim(),content:data.content.trim(),attachments:[...kept,...uploaded]}).eq('id',current.id).select('id').single());}
      catch(error){await removeFiles('idea-media',uploaded.map(a=>a.path));throw error;}
      await removeFiles('idea-media',(current.attachments||[]).filter(a=>removed.has(a.path)).map(a=>a.path));
      toast('Идея обновлена');await render();
    });
  });
  document.querySelectorAll('.delete-idea').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить эту идею?'))return;b.disabled=true;try{const idea=await query(db.from('ideas').select('attachments').eq('id',b.dataset.id).single());const comments=await query(db.from('idea_comments').select('attachments').eq('idea_id',b.dataset.id));await query(db.from('ideas').delete().eq('id',b.dataset.id));await removeFiles('idea-media',[...(idea.attachments||[]),...comments.flatMap(c=>c.attachments||[])].map(a=>a.path));toast('Идея удалена');render();}catch(err){toast(readableError(err));b.disabled=false;}});
  document.querySelectorAll('.idea-comments').forEach(details=>details.ontoggle=()=>{
    if(!details.isConnected)return;
    if(details.open)openCommentThreads.add(details.dataset.ideaId);else openCommentThreads.delete(details.dataset.ideaId);
  });
  document.querySelectorAll('.comment-form').forEach(form=>form.onsubmit=ev=>{
    ev.preventDefault();submit(form,async data=>{
      const content=data.content.trim();
      if(!content)throw new MediaError('Напишите комментарий.');
      const attachments=await uploadFiles([...form.elements.attachments.files],user.id);
      try{await query(db.from('idea_comments').insert({idea_id:form.dataset.ideaId,user_id:user.id,content,attachments}));}
      catch(error){await removeFiles('idea-media',attachments.map(a=>a.path));throw error;}
      openCommentThreads.add(form.dataset.ideaId);toast('Комментарий опубликован');await render();
    });
  });
  document.querySelectorAll('.edit-comment').forEach(button=>button.onclick=()=>{const form=button.closest('.idea-comment').querySelector('.comment-edit');form.hidden=false;button.hidden=true;form.elements.content.focus();});
  document.querySelectorAll('.cancel-edit-comment').forEach(button=>button.onclick=()=>{const form=button.closest('form');form.reset();form.querySelector('.form-error').textContent='';form.hidden=true;form.closest('.idea-comment').querySelector('.edit-comment').hidden=false;});
  document.querySelectorAll('.comment-edit').forEach(form=>form.onsubmit=ev=>{
    ev.preventDefault();submit(form,async data=>{
      const current=await query(db.from('idea_comments').select('*').eq('id',form.dataset.id).single());
      if(current.user_id!==user.id)throw new MediaError('Редактировать можно только свой комментарий.');
      const content=data.content.trim();if(!content)throw new MediaError('Напишите комментарий.');
      const removed=new Set([...form.querySelectorAll('.remove-attachment:checked')].map(input=>input.value));
      const kept=(current.attachments||[]).filter(a=>!removed.has(a.path)),files=[...form.elements.attachments.files];
      if(kept.length+files.length>6)throw new MediaError('В комментарии может быть до 6 файлов.');
      const uploaded=await uploadFiles(files,user.id);
      try{await query(db.from('idea_comments').update({content,attachments:[...kept,...uploaded]}).eq('id',current.id).select('id').single());}
      catch(error){await removeFiles('idea-media',uploaded.map(a=>a.path));throw error;}
      await removeFiles('idea-media',(current.attachments||[]).filter(a=>removed.has(a.path)).map(a=>a.path));
      openCommentThreads.add(current.idea_id);toast('Комментарий обновлён');await render();
    });
  });
  document.querySelectorAll('.delete-comment').forEach(button=>button.onclick=async()=>{
    if(!confirm('Удалить этот комментарий?'))return;
    button.disabled=true;
    try{const comment=await query(db.from('idea_comments').select('attachments').eq('id',button.dataset.id).single());await query(db.from('idea_comments').delete().eq('id',button.dataset.id));await removeFiles('idea-media',(comment.attachments||[]).map(a=>a.path));openCommentThreads.add(button.dataset.ideaId);toast('Комментарий удалён');await render();}
    catch(error){toast(readableError(error));button.disabled=false;}
  });
  const connectTelegram=document.querySelector('#connect-telegram');if(connectTelegram)connectTelegram.onclick=async()=>{
    if(demoMode){toast('В демо Telegram не подключается');return;}connectTelegram.disabled=true;
    try{const {data,error}=await db.functions.invoke('telegram-notifications',{body:{action:'connect'}});if(error)throw error;
      const link=document.querySelector('#telegram-connect-link');link.href=data.url;link.hidden=false;document.querySelector('#telegram-settings-status').textContent='Откройте бота и нажмите «Запустить». Затем проверьте подключение.';
    }catch{document.querySelector('#telegram-settings-status').textContent='Не удалось создать ссылку. Организатору нужно проверить настройку Telegram-функций.';}
    finally{connectTelegram.disabled=false;}
  };
  const refreshTelegram=document.querySelector('#refresh-telegram');if(refreshTelegram)refreshTelegram.onclick=()=>render();
  const disconnectTelegram=document.querySelector('#disconnect-telegram');if(disconnectTelegram)disconnectTelegram.onclick=async()=>{disconnectTelegram.disabled=true;try{await query(db.rpc('disconnect_telegram'));await render();}catch(error){toast(readableError(error));disconnectTelegram.disabled=false;}};
  const inbox=document.querySelector('.notification-inbox');if(inbox)inbox.ontoggle=()=>{if(inbox.isConnected)notificationsOpen=inbox.open;};
  const refreshNotifications=document.querySelector('.refresh-notifications');if(refreshNotifications)refreshNotifications.onclick=()=>{notificationsOpen=true;render();};
  document.querySelectorAll('.read-notification').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await query(db.rpc('read_notification',{notification_id:button.dataset.id}));notificationsOpen=true;await render();}catch(error){toast(readableError(error));button.disabled=false;}});
  document.querySelectorAll('.assigned-character-form').forEach(form=>form.onsubmit=ev=>{ev.preventDefault();submit(form,async details=>{for(const key of Object.keys(details))details[key]=details[key].trim();await query(db.rpc('edit_assigned_character',{target_character:form.dataset.id,details}));form.querySelector('.form-success').textContent='Карточка персонажа сохранена';toast('Персонаж обновлён');});});
  const logout=document.querySelector('#logout');if(logout)logout.onclick=async()=>{logout.disabled=true;const {error}=await db.auth.signOut();if(error){toast(readableError(error));logout.disabled=false;return;}user=null;profile=null;admin=false;go('cast');};
  if(page==='admin'&&admin){
    document.querySelectorAll('.assignment-form').forEach(form=>form.onsubmit=ev=>{ev.preventDefault();submit(form,async data=>{await query(db.rpc('set_character_actor',{target_character:form.dataset.id,actor_user:data.actor_user||null}));form.querySelector('.form-success').textContent='Назначение сохранено';});});
    for(const [id,action] of [['setup-telegram','setup'],['retry-telegram','retry']]){const button=document.getElementById(id);if(button)button.onclick=async()=>{if(demoMode){toast('В демо сообщения остаются на сайте');return;}button.disabled=true;
      try{const {data,error}=await db.functions.invoke('telegram-notifications',{body:{action}});if(error)throw error;document.querySelector('#telegram-admin-status').textContent=action==='setup'?'Бот настроен. Участники могут подключить Telegram в профиле.':`Доставлено ${data.sent}, ошибок ${data.failed}, в очереди ${data.pending}. Если очередь не пуста, повторите позже.`;}
      catch{document.querySelector('#telegram-admin-status').textContent='Не удалось выполнить действие. Проверьте Secrets и настройки Edge Functions.';}
      finally{button.disabled=false;}
    };}
    const notification=document.querySelector('#notification-form');if(notification)notification.onsubmit=ev=>{ev.preventDefault();submit(notification,async data=>{const count=await query(db.rpc('send_notification',{title_text:data.title_text.trim(),message_text:data.message_text.trim(),recipient_user:data.recipient_user||null}));notification.reset();notification.querySelector('.form-success').textContent=`На сайте отправлено. Получателей: ${count}.`;
      if(!demoMode){try{const {data,error}=await db.functions.invoke('telegram-notifications',{body:{action:'dispatch'}});if(error)throw error;notification.querySelector('.form-success').textContent+=` Telegram: доставлено ${data.sent}, ошибок ${data.failed}, в очереди ${data.pending}.`;}
      catch{notification.querySelector('.form-success').textContent+=' Telegram пока не отправлен. Проверьте настройки и нажмите «Повторить / дослать». Сообщение на сайте сохранено.';}}});};

    document.querySelectorAll('.review').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await query(db.rpc('review_application',{application_id:b.dataset.id,new_status:b.dataset.status}));toast('Статус изменён');render();}catch(err){toast(readableError(err));b.disabled=false;}});
    for(const [formId,table,editClass] of [['lore-form','lore_chapters','edit-lore'],['character-form','characters','edit-character']]){
      const form=document.getElementById(formId);if(!form)continue;
      form.onsubmit=ev=>{ev.preventDefault();submit(form,async data=>{const id=data.id;delete data.id;data.sort_order=Number(data.sort_order);for(const key of Object.keys(data))if(typeof data[key]==='string')data[key]=data[key].trim();await query(id?db.from(table).update(data).eq('id',id):db.from(table).insert(data));toast('Материалы сохранены');render();});};
      document.querySelectorAll('.'+editClass).forEach(b=>b.onclick=async()=>{try{const item=await query(db.from(table).select('*').eq('id',b.dataset.id).single());for(const [key,val]of Object.entries(item)){const input=form.elements.namedItem(key);if(input)input.value=val??'';}form.scrollIntoView({behavior:'smooth'});form.elements[1].focus();}catch(err){toast(readableError(err));}});
    }
  }
}
window.addEventListener('hashchange',()=>render());
window.matchMedia?.('(max-width:720px)').addEventListener('change',event=>{const composer=document.querySelector('.idea-proposal');if(composer)composer.open=!event.matches;});
let authTimer;
if(db)db.auth.onAuthStateChange((event,session)=>{
  // Defer database calls outside the Supabase auth callback lock.
  if(event==='PASSWORD_RECOVERY'){location.hash='/reset';}
  if(event==='SIGNED_OUT'){user=null;admin=false;profile=null;render();return;}
  if(event==='SIGNED_IN'||event==='USER_UPDATED'){
    clearTimeout(authTimer);authTimer=setTimeout(async()=>{try{await loadIdentity();restoreSharedIdea();if(route()!=='reset')render();}catch(err){toast(readableError(err));}},0);
  }
});
try{await loadIdentity();restoreSharedIdea();}catch(err){toast(readableError(err));}
await render();
