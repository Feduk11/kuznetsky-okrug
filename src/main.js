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
const openAdminSections=new Set();
const messageDrafts=new Map();
function messageDraftKey(id,kind){return 'final-chapter-'+kind+'-draft:'+id;}
function draftValues(form){return Object.fromEntries((form._draftNames||[]).map(name=>[name,form.elements.namedItem(name).value]));}
function clearFormDraft(form){
 if(!form?._draftKey)return;messageDrafts.delete(form._draftKey);try{localStorage.removeItem(form._draftKey);}catch{}form.dataset.draftClean='true';
 const status=form.querySelector('.draft-status');if(status)status.textContent='';
}
function saveMessageDraft(form){
 if(!form?._draftKey||form.dataset.draftClean==='true')return;
 const values=draftValues(form),changed=JSON.stringify(values)!==JSON.stringify(form._draftBaseline);
 if(!changed){clearFormDraft(form);return;}
 const draft={values,updatedAt:Date.now()};messageDrafts.set(form._draftKey,draft);
 let persistent=true;try{localStorage.setItem(form._draftKey,JSON.stringify(draft));}catch{persistent=false;}
 const status=form.querySelector('.draft-status');if(status)status.textContent=persistent?'Черновик сохранён на этом устройстве':'Черновик сохранён до закрытия страницы';
}
function savePageDrafts(){document.querySelectorAll('form[data-draft-owner]').forEach(saveMessageDraft);}
function restoreMessageDraft(form,kind='notification'){
 if(!user||form._draftKey)return;
 form.dataset.draftOwner=user.id;form.dataset.draftKind=kind;form._draftKey=messageDraftKey(user.id,kind);
 form._draftNames=[...form.elements].filter(input=>input.name&&!['file','hidden','password','checkbox','submit','button'].includes(input.type)).map(input=>input.name);
 form._draftBaseline=draftValues(form);
 const tools=document.createElement('div');tools.className='draft-tools';tools.innerHTML='<span class="help draft-status" role="status"></span><button class="text-link discard-draft" type="button">Сбросить черновик</button>';if(form.querySelector('input[type=file]'))tools.insertAdjacentHTML('beforeend','<span class="help">После обновления страницы файлы нужно выбрать заново.</span>');form.append(tools);
 tools.querySelector('button').onclick=()=>{for(const [name,value]of Object.entries(form._draftBaseline))form.elements.namedItem(name).value=value;clearFormDraft(form);};
 let draft=messageDrafts.get(form._draftKey);if(!draft)try{draft=JSON.parse(localStorage.getItem(form._draftKey));}catch{}
 if(draft){const values=draft.values||draft;for(const name of form._draftNames){const input=form.elements.namedItem(name),value=values[name];if(typeof value!=='string')continue;
  if(input.tagName!=='SELECT'||[...input.options].some(option=>option.value===value))input.value=value.slice(0,input.maxLength>0?input.maxLength:30000);
 }
 if(JSON.stringify(draftValues(form))!==JSON.stringify(form._draftBaseline)){
  form.hidden=false;tools.querySelector('.draft-status').textContent='Восстановлен черновик';
  for(let parent=form.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  if(kind==='notification')openAdminSections.add('admin-notifications');
  const edit=form.closest('.idea-comment')?.querySelector('.edit-comment')||form.closest('.idea')?.querySelector('.edit-idea');if(edit&&form.matches('.idea-edit,.comment-edit'))edit.hidden=true;
 }}
 for(const type of ['input','change'])form.addEventListener(type,()=>{form.dataset.draftClean='false';saveMessageDraft(form);});
 form.addEventListener('reset',()=>clearFormDraft(form));
}
function wireLongFormDrafts(){
 for(const [selector,kind]of [['#application-form','application'],['#idea-form','idea-new'],['.idea-edit','idea-edit'],['.comment-form','comment-new'],['.comment-edit','comment-edit'],['.assigned-character-form','character']]){
  document.querySelectorAll(selector).forEach(form=>restoreMessageDraft(form,kind+(form.dataset.id||form.dataset.ideaId?':'+(form.dataset.id||form.dataset.ideaId):'')));
 }
}
const ideaCategories={scene:'Сцена',location:'Локация',character:'Персонаж',music:'Музыка',other:'Другое'};
const ideaStatuses={discussing:'Обсуждаем',accepted:'Взято в сценарий',deferred:'Отложено'};
let ideaFilters={search:'',category:'all',sort:'new',status:'all'};
const expandedIdeas=new Set();
const categoryField=value=>`<label class="field"><span>Категория</span><select name="category">${Object.entries(ideaCategories).map(([key,label])=>`<option value="${key}" ${key===(value||'other')?'selected':''}>${label}</option>`).join('')}</select></label>`;
function ideaText(idea){const long=idea.content.length>500||idea.content.split('\n').length>7,open=expandedIdeas.has(idea.id)||sharedIdeaId()===idea.id;return `<p class="idea-content ${long&&!open?'is-collapsed':''}" id="idea-text-${e(idea.id)}">${e(idea.content)}</p>${long?`<button class="text-link idea-read-more" type="button" data-id="${e(idea.id)}" aria-expanded="${open}" aria-controls="idea-text-${e(idea.id)}">${open?'Свернуть':'Читать полностью'}</button>`:''}`;}
function ideaReview(idea){return admin?`<details class="idea-review"><summary>Статус и закрепление</summary><form class="form idea-review-form" data-id="${e(idea.id)}"><label class="field"><span>Решение по идее</span><select name="story_status">${Object.entries(ideaStatuses).map(([key,label])=>`<option value="${key}" ${key===(idea.story_status||'discussing')?'selected':''}>${label}</option>`).join('')}</select></label><label class="check"><input type="checkbox" name="is_pinned" ${idea.is_pinned?'checked':''}><span>Закрепить наверху</span></label>${errors}<button class="button secondary small" type="submit">Сохранить решение</button></form></details>`:'';}
function ideasFilterBar(){return `<section class="ideas-filters" aria-label="Поиск и сортировка идей"><label class="field"><span>Поиск идей</span><input id="ideas-search" type="search" maxlength="200" placeholder="Тема, текст или автор" value="${e(ideaFilters.search)}"></label><label class="field"><span>Категория</span><select id="ideas-category"><option value="all">Все категории</option>${Object.entries(ideaCategories).map(([key,label])=>`<option value="${key}" ${ideaFilters.category===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field"><span>Статус</span><select id="ideas-status"><option value="all">Все статусы</option>${Object.entries(ideaStatuses).map(([key,label])=>`<option value="${key}" ${ideaFilters.status===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field"><span>Сортировка</span><select id="ideas-sort">${[['new','Новые'],['popular','Популярные'],['discussed','Обсуждаемые']].map(([key,label])=>`<option value="${key}" ${ideaFilters.sort===key?'selected':''}>${label}</option>`).join('')}</select></label><p class="help ideas-results" role="status"></p><button type="button" class="text-link ideas-clear">Сбросить фильтры</button></section>`;}
function applyIdeaFilters(){
 const list=document.querySelector('.ideas-list');if(!list)return;
 const search=ideaFilters.search.trim().toLocaleLowerCase('ru-RU'),cards=[...list.querySelectorAll('.idea[data-idea-id]')];
 cards.sort((a,b)=>Number(b.dataset.pinned)-Number(a.dataset.pinned)||(ideaFilters.sort==='popular'?Number(b.dataset.likes)-Number(a.dataset.likes):ideaFilters.sort==='discussed'?Number(b.dataset.comments)-Number(a.dataset.comments):0)||Number(b.dataset.created)-Number(a.dataset.created)||a.dataset.ideaId.localeCompare(b.dataset.ideaId));
 let shown=0;for(const card of cards){card.hidden=!(card.dataset.search.includes(search)&&(ideaFilters.category==='all'||card.dataset.category===ideaFilters.category)&&(ideaFilters.status==='all'||card.dataset.status===ideaFilters.status));if(!card.hidden)shown++;list.append(card);}
 const results=document.querySelector('.ideas-results');if(results)results.textContent=`Показано ${shown} из ${cards.length}. Закреплённые идеи — первыми.`;
 const emptySearch=document.querySelector('.ideas-no-results');if(emptySearch)emptySearch.hidden=shown>0||cards.length===0;
}
const statusLabels = {submitted:'На рассмотрении',accepted:'В составе',declined:'Не выбрана'};
const navs = [['cast','Актёрский состав'],['ideas','Идеи сюжета'],['characters','Персонажи'],['roadmap','Дорожная карта'],['lore','Лор трилогии']];
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
const notificationState={userId:null,messages:[],feedback:[],error:null};
let notificationPending=null;
const bellIcon='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 20h4"/></svg>';
function headerNotifications(){return user?`<div class="header-notifications"><button type="button" class="header-bell" aria-label="Уведомления" aria-expanded="false" aria-controls="header-inbox">${bellIcon}<span class="header-unread">…</span></button><div class="header-inbox" id="header-inbox" hidden><p class="help">Загружаем уведомления…</p></div></div>`:'';}
function paintHeaderNotifications(){
 if(!user||notificationState.userId!==user.id)return;
 const count=notificationState.messages.filter(message=>!message.read_at).length+notificationState.feedback.filter(item=>!item.read_at).length;
 const button=document.querySelector('.header-bell');if(button){button.querySelector('.header-unread').textContent=notificationState.error?'!':count;button.setAttribute('aria-label',notificationState.error?'Не удалось обновить уведомления':`Уведомления: ${count} непрочитанных`);}
 const panel=document.querySelector('#header-inbox');if(panel){panel.innerHTML=`<div class="section-head"><h3>Уведомления</h3><button type="button" class="text-link header-refresh">Обновить</button></div>${notificationState.error?'<p class="help">Не удалось обновить сообщения. Попробуйте ещё раз.</p>':''}${notificationState.messages.slice(0,10).map(message=>`<article class="header-message ${message.read_at?'':'unread'}"><b>${e(message.title)}</b><p>${e(message.message.slice(0,180))}${message.message.length>180?'…':''}</p><span class="help">${e(date(message.created_at))}</span>${message.read_at?'':`<button class="text-link header-read" type="button" data-id="${e(message.id)}">Прочитано</button>`}</article>`).join('')}${notificationState.feedback.slice(0,5).map(item=>`<a class="header-message ${item.read_at?'':'unread'}" href="#/admin?section=feedback"><b>Обращение: ${e(item.title)}</b><span class="help">${e(item.profiles?.display_name||'Участник')}</span></a>`).join('')}${!notificationState.messages.length&&!notificationState.feedback.length&&!notificationState.error?'<p class="help">Сообщений пока нет.</p>':''}<a class="text-link" href="#/profile">Все уведомления в профиле</a>`;
 panel.querySelector('.header-refresh').onclick=()=>refreshHeaderNotifications();
 panel.querySelectorAll('.header-read').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await query(db.rpc('read_notification',{notification_id:button.dataset.id}));const item=notificationState.messages.find(message=>message.id===button.dataset.id);if(item)item.read_at=new Date().toISOString();paintHeaderNotifications();}catch(error){button.disabled=false;toast(readableError(error));}});
 }
 const profileInbox=document.querySelector('.notification-inbox');if(profileInbox&&route()==='profile'){const open=profileInbox.open;const holder=document.createElement('div');holder.innerHTML=notificationInbox(notificationState.messages,notificationState.error);const replacement=holder.firstElementChild;replacement.open=open;profileInbox.replaceWith(replacement);replacement.ontoggle=()=>{if(replacement.isConnected)notificationsOpen=replacement.open;};replacement.querySelector('.refresh-notifications').onclick=()=>refreshHeaderNotifications();replacement.querySelectorAll('.read-notification').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await query(db.rpc('read_notification',{notification_id:button.dataset.id}));const item=notificationState.messages.find(message=>message.id===button.dataset.id);if(item)item.read_at=new Date().toISOString();paintHeaderNotifications();}catch(error){button.disabled=false;toast(readableError(error));}});replacement.querySelectorAll('.retry-block').forEach(button=>button.onclick=()=>refreshHeaderNotifications());}
}
async function refreshHeaderNotifications(){
 if(!db||!user||notificationPending===user.id)return;
 const id=user.id;notificationPending=id;
 if(notificationState.userId!==id){notificationState.userId=id;notificationState.messages=[];notificationState.feedback=[];notificationState.error=null;}
 try{const blocks=await Promise.all([readBlock(query(db.from('notifications').select('*').eq('recipient_id',id).order('created_at',{ascending:false}))),admin?readBlock(query(db.from('site_feedback').select('*,profiles(display_name)').order('created_at',{ascending:false}))):Promise.resolve({data:[],error:null})]);
  if(user?.id!==id)return;
  if(!blocks[0].error)notificationState.messages=blocks[0].data||[];
  if(!blocks[1].error)notificationState.feedback=blocks[1].data||[];
  notificationState.error=blocks.find(block=>block.error)?.error||null;paintHeaderNotifications();
 }finally{if(notificationPending===id)notificationPending=null;}
}
function wireHeader(){
 const button=document.querySelector('.header-bell');if(!button)return;
 button.onclick=()=>{const panel=document.getElementById('header-inbox');panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){paintHeaderNotifications();refreshHeaderNotifications();}};
 paintHeaderNotifications();refreshHeaderNotifications();
}
function frame(page) {
  const navScroll=document.querySelector('.nav')?.scrollLeft || 0;
  const navigation=admin?[...navs.slice(0,-1),['admin','Управление'],navs.at(-1)]:navs;
  root.innerHTML=`<div class="shell">${demoMode?`<div class="demo-bar"><div><b>Локальный прототип</b><span>Тестовые данные · не канон трилогии</span></div><div class="demo-controls"><label for="demo-role">Смотреть как</label><select id="demo-role"><option value="guest" ${getDemoRole()==='guest'?'selected':''}>Гость</option><option value="actor" ${getDemoRole()==='actor'?'selected':''}>Актёр</option><option value="organizer" ${getDemoRole()==='organizer'?'selected':''}>Организатор и актёр</option></select><button id="demo-reset" type="button">Сбросить демо</button></div></div>`:''}<header class="header"><a class="brand" href="#/cast"><img src="${import.meta.env.BASE_URL}favicon.svg" alt=""><span>${e(project.title)}</span></a><nav class="nav" aria-label="Основная навигация">${navigation.map(([id,label])=>`<a href="#/${id}" class="${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="header-account">${headerNotifications()}<a class="account" href="#/${user?'profile':'login'}">${user?'Мой профиль':'Войти'}</a></div></header><main id="main" tabindex="-1" class="content"><div class="topline"><b>III</b><span></span>${e(project.subtitle)}</div><div id="view" aria-busy="true"><div class="loading-skeleton" role="status"><span class="sr-only">Загружаем…</span><div></div><div></div><div></div></div></div></main><footer class="footer"><span>${e(project.title)} · ${demoMode?'Демо сохраняет изменения только в этом браузере':'Собираем команду заключительного фильма'}</span><a href="#/privacy">Как используются ваши данные</a></footer></div>`;
  document.querySelector('.nav').scrollLeft=navScroll;wireHeader();
}
async function readRequired(request,ms=12000){
 let timer;try{return await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new Error('Read timeout');error.name='ReadTimeout';reject(error);},ms);})]);}finally{clearTimeout(timer);}
}
async function readBlock(request){try{return {data:await readRequired(request),error:null};}catch(error){return {data:null,error};}}
function blockNotice(title){return `<div class="notice error" role="status">${e(title)} <button type="button" class="text-link retry-block">Повторить</button></div>`;}
async function rows(table,order='created_at') {
  if (!db) return [];
  return readRequired(query(db.from(table).select(table==='cast_members'?'id,display_name,role_name,participation,created_at,avatar_url,avatar_path':'*').order(order,{ascending:table==='lore_chapters'||table==='characters'})));
}
function offline() { return !configured ? '<div class="notice">Вход пока не настроен. Организатор подключает аккаунты участников; попробуйте позже.</div>' : ''; }
async function render() {
  savePageDrafts();
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
    if(page==='admin'){foldAdminSections();if(new URLSearchParams(location.hash.split('?')[1]||'').get('section')==='feedback'){const details=document.querySelector('#admin-feedback details');if(details){details.open=true;openAdminSections.add('admin-feedback');}}}
    wire(page);wireLongFormDrafts();
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
  const castBlock=await readBlock(rows('cast_members')),cast=castBlock.data||[],ideaCount='…';
  const mobile=window.matchMedia?.('(max-width:720px)').matches||false;
  return heading('Собираем финальный состав',project.description.replace('. Собираем','.\nСобираем'),`<a class="button" href="#/${user?'profile':'register'}">${user?'Заполнить анкету':'Хочу участвовать'}</a>`)+offline()+
    `<div class="metrics"><div class="metric"><span>Актёров в составе</span><strong>${castBlock.error?'—':cast.length}</strong></div><div class="metric"><span>Предложено идей</span><strong id="home-idea-count">${ideaCount}</strong><span id="home-count-error" class="help" hidden></span></div></div><div class="grid"><section class="panel"><div class="section-head"><h2>Команда фильма</h2><span>${cast.length} участников</span></div>${castBlock.error?blockNotice('Не удалось загрузить актёрский состав.'):cast.length?cast.map(c=>`<article class="cast-card">${actorAvatar(c.display_name,photoUrl(c))}<div><h3>${e(c.display_name)}</h3><p>${e(c.role_name || 'Роль уточняется')}</p></div><span class="chip">${c.participation==='returning'?'Прежний состав':'Новый актёр'}</span></article>`).join(''):empty('Первый шаг — собрать команду','Здесь появятся актёры, чьё участие подтвердит организатор. Если вы снимались раньше или хотите присоединиться впервые, заполните анкету.','01')}</section><aside class="panel">${user?`<details class="cast-join" ${mobile?'':'open'}><summary>Присоединиться</summary><div class="cast-join-body">`:''}<div class="aside-title"><h2>Присоединиться</h2><span class="chip">Открытый набор</span></div><p class="muted small">Прежним актёрам — сообщить, готовы ли вы вернуться.<br>Новым — рассказать о себе и выбрать желаемую роль.</p><p class="muted small">Если вы иногородний, но хотите принять участие, возможна ваша интеграция с помощью ИИ-монтажа.</p><a class="button full" href="#/${user?'profile':'register'}">${user?'Мой профиль':'Создать аккаунт'}</a><div class="steps"><div class="step"><b>01</b><div><h3>Расскажите о себе</h3><p>Ваш город и возможность участвовать в съёмках локально в НВКЗ.</p></div></div><div class="step"><b>02</b><div><h3>Познакомьтесь с историей</h3><p><a class="text-link" href="#/lore">Лор трилогии</a> и <a class="text-link" href="#/characters">персонажи</a> помогут найти свою роль.</p></div></div><div class="step"><b>03</b><div><h3><a class="step-idea-link" href="#/ideas">Предложите идею</a></h3><p>Обсудим, как завершить историю вместе. <a class="text-link" href="#/ideas">Идеи сюжета</a></p></div></div></div>${user?'</div></details>':''}</aside></div><section class="archive-block" aria-labelledby="archive-title"><h2 id="archive-title">Две первые серии</h2><div class="archive-previews"><img src="${import.meta.env.BASE_URL}previous-films.png" alt="Превью второй и первой серий «Кузнецкого округа», снятых 11 лет назад" width="437" height="169" loading="lazy"><a class="archive-link episode-second" href="${e(project.episodes.second)}" target="_blank" rel="noopener noreferrer" aria-label="Смотреть вторую серию «Кузнецкого округа» на YouTube — откроется в новой вкладке"></a><a class="archive-link episode-first" href="${e(project.episodes.first)}" target="_blank" rel="noopener noreferrer" aria-label="Смотреть первую серию «Кузнецкого округа» на YouTube — откроется в новой вкладке"></a></div></section>`;
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
  return (chapters.length?`<div class="lore-content">${chapters.map((c,i)=>`<article class="chapter" id="chapter-${e(c.id)}"><h2>${e(c.title)}</h2><div class="prose">${e(c.content.replace('Дон Потник унаследовал преступную империю. Жора,','Дон Потник унаследовал преступную империю.\nЖора,'))}</div></article>`).join('')}</div>`:`<div class="content-empty">${empty('Историю скоро добавим','Организатор опубликует пересказ прошлых частей и правила мира. Здесь будет канон трилогии, на который можно опираться в новых идеях.','I / II / III')}${admin?'<p><a class="button secondary" href="#/admin">Добавить раздел</a></p>':''}</div>`);
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
  let html=heading('Как закончится история?','Предложения участников по сюжету заключительного фильма.').replace('class="heading"',`class="heading ideas-heading ${user?'ideas-signed-in':''}"`);
  if(!db)return html+offline()+empty('Идеи скоро появятся','Организатор подключает базу сайта.');
  if(!user)rememberSharedIdea();
  const [ideasBlock,commentsBlock,likesBlock]=await Promise.all([
    readBlock(query(db.from(user?'ideas':'public_ideas').select(user?'*, profiles!ideas_user_id_fkey(display_name,avatar_url,avatar_path)':'*').order('created_at',{ascending:false}))),
    readBlock(query(db.from(user?'idea_comments':'public_idea_comments').select(user?'*, profiles!idea_comments_user_id_fkey(display_name,avatar_url,avatar_path)':'*').order('created_at',{ascending:true}))),
    readBlock(query(db.rpc('get_idea_likes')))
  ]);
  const ideas=ideasBlock.data||[],comments=commentsBlock.data||[],likeStats=likesBlock.error?null:likesBlock.data;
  const likesByIdea=new Map((likeStats||[]).map(item=>[item.idea_id,item]));
  const likeButton=idea=>{const stats=likesByIdea.get(idea.id),liked=Boolean(stats?.liked),count=stats?.like_count??0;
    const label=likeStats===null?'Лайки недоступны. Обновите страницу.':`${liked?'Снять лайк':'Поставить лайк'}. Лайков: ${count}`;
    return `<button type="button" class="button secondary small idea-like" data-id="${e(idea.id)}" aria-pressed="${liked}" aria-label="${e(label)}" title="${e(label)}" ${likeStats===null?'disabled':''}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10H3v11h4V10Zm0 0 5-7c2 0 3 2 2 5l-.5 2H19a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7Z"/></svg><span class="like-count" aria-live="polite">${likeStats===null?'—':e(count)}</span></button>`;
  };
  const mediaBlock=await readBlock(attachmentUrls([...ideas,...comments])),mediaUrls=mediaBlock.data||new Map();
  const media=idea=>`<div class="idea-media">${(idea.attachments||[]).map(a=>{const url=mediaUrls.get(a.path);return url?(a.kind==='image'?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer"><img src="${e(url)}" alt="${e(a.name)}" loading="lazy"></a>`:`<div class="idea-audio"><span>${e(a.name)}</span><audio controls preload="none" src="${e(url)}"></audio></div>`):`<p class="help">${e(a.name)} — файл недоступен. Обновите страницу.</p>`;}).join('')}</div>`;
  const editor=idea=>idea.user_id===user?.id?`<form class="form idea-edit" data-id="${e(idea.id)}" hidden><h3>Редактировать идею</h3>${field('Название','title',{max:160,value:idea.title})}${categoryField(idea.category)}${area('Идея сюжета','content',{max:10000,value:idea.content})}${(idea.attachments||[]).length?`<fieldset class="edit-attachments"><legend>Прикреплённые файлы</legend>${idea.attachments.map(a=>`<label class="check"><input type="checkbox" class="remove-attachment" value="${e(a.path)}"><span>Удалить: ${e(a.name)}</span></label>`).join('')}</fieldset>`:''}<label class="field"><span>Добавить картинки или музыку</span><input type="file" name="attachments" multiple accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav"></label><span class="help">До 6 файлов в идее. Картинки — до 8 МБ, музыка — до 20 МБ.</span>${errors}<div class="idea-actions"><button class="button small" type="submit">Сохранить изменения</button><button class="button secondary small cancel-edit-idea" type="button">Отмена</button></div></form>`:'';
  const sharing=idea=>{
    const url=ideaLink(idea.id),text=idea.title;
    return `<div class="idea-share"><div class="share-panel" id="share-${e(idea.id)}" hidden><label class="field"><span>Ссылка на идею</span><input class="share-url" readonly value="${e(url)}" aria-label="Ссылка на идею"></label><div class="idea-actions"><button type="button" class="button secondary small copy-idea-link">Скопировать</button><a class="button secondary icon-button" aria-label="Поделиться в Telegram" title="Telegram" href="https://t.me/share/url?${e(new URLSearchParams({url,text}).toString())}" target="_blank" rel="noopener noreferrer">${loginIcons.telegram}</a><a class="button secondary icon-button" aria-label="Поделиться в ВК" title="ВК" href="https://vk.com/share.php?${e(new URLSearchParams({url,title:text}).toString())}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#0077ff"/><path fill="white" d="M4 7h3c.2 4 1.7 5.8 2.8 6V7h2.8v3.5c1.1-.1 2.2-1.7 2.6-3.5H18c-.3 2.2-1.8 3.9-2.8 4.6 1 .6 2.8 2.1 3.4 4.4h-3c-.5-1.8-1.6-3.2-3-3.4V16h-.4C7 16 4.4 12.5 4 7Z"/></svg></a></div><p class="help">Ссылка доступна всем, даже без входа.</p><p class="share-status" role="status"></p></div></div>`;
  };
  const threads=new Map();
  for(const comment of comments){if(!threads.has(comment.idea_id))threads.set(comment.idea_id,[]);threads.get(comment.idea_id).push(comment);}
  const commentEditor=c=>c.user_id===user?.id?`<form class="form comment-edit" data-id="${e(c.id)}" data-idea-id="${e(c.idea_id)}" hidden><h3>Редактировать комментарий</h3>${area('Комментарий','content',{max:2000,value:c.content})}${attachmentRemoval(c.attachments)}${attachmentInput('Добавить картинки или музыку')}${errors}<div class="idea-actions"><button type="submit" class="button small">Сохранить</button><button type="button" class="button secondary small cancel-edit-comment">Отмена</button></div></form>`:'';
  const discussion=idea=>{
    const thread=threads.get(idea.id)||[];if(commentsBlock.error)return `<div class="idea-comments">${blockNotice('Комментарии временно недоступны.')}</div>`;
    return `<details class="idea-comments" data-idea-id="${e(idea.id)}" ${openCommentThreads.has(idea.id)?'open':''}><summary>Комментарии <span class="comment-count">${thread.length}</span></summary><div class="comment-list">${thread.length?thread.map(c=>`<article class="idea-comment"><div class="idea-meta"><div class="idea-author">${actorAvatar(c.profiles?.display_name||'Участник',photoUrl(c.profiles))}<span>${e(c.profiles?.display_name||'Участник')}</span></div><span>·</span><time datetime="${e(c.created_at)}">${e(date(c.created_at))}</time></div><p>${e(c.content)}</p>${media(c)}<div class="comment-actions">${c.user_id===user?.id?`<button type="button" class="button secondary icon-button edit-comment" data-id="${e(c.id)}" aria-label="Редактировать комментарий" title="Редактировать комментарий">${actionIcon('edit')}</button>`:''}${c.user_id===user?.id||admin?`<button type="button" class="button secondary icon-button delete-comment" data-id="${e(c.id)}" data-idea-id="${e(idea.id)}" aria-label="Удалить комментарий" title="Удалить комментарий">${actionIcon('trash')}</button>`:''}</div>${commentEditor(c)}</article>`).join(''):'<p class="comment-empty">Пока нет комментариев. Начните обсуждение.</p>'}</div>${user?`<form class="form comment-form" data-idea-id="${e(idea.id)}">${area('Ваш комментарий','content',{max:2000,placeholder:'Что думаете об этой идее?'})}${attachmentInput('Картинки и музыка (необязательно)')}${errors}<button class="button small" type="submit">Отправить комментарий</button><span class="help">До 2000 символов. Комментарий и файлы будут видны всем.</span></form>`:`<p class="help"><a class="text-link idea-login" href="#/login" data-id="${e(idea.id)}">Войдите</a>, чтобы оставить комментарий.</p>`}</details>`;
  };
  const mobile=window.matchMedia?.('(max-width:720px)').matches || false;
  return html+ideasFilterBar()+`<div class="grid ideas-grid"><aside class="panel idea-composer"><details class="idea-proposal" ${mobile?'':'open'}><summary>Предложить идею <span aria-hidden="true">＋</span></summary><div class="proposal-body">${user?`<form id="idea-form" class="form"><h2>Предложить идею</h2>${field('Название','title',{max:160,placeholder:'О чём ваша идея?'})}${categoryField('scene')}${area('Идея сюжета','content',{max:10000,placeholder:'События, герои и то, как это связано с прошлыми частями…'})}<label class="field"><span>Картинки и музыка (необязательно)</span><input type="file" name="attachments" multiple accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-wav"></label><p class="help">До 6 файлов: JPG, PNG, WebP — до 8 МБ; MP3, M4A, OGG, WAV — до 20 МБ. Файлы доступны всем посетителям.</p>${errors}<button class="button" type="submit">Опубликовать идею</button><span class="help">Ваше имя, предложение и вложения будут видны всем.</span></form>`:lock('Предложите свою идею','Войдите, чтобы публиковать идеи и участвовать в обсуждении.')}</div></details></aside><section class="ideas-list">${ideasBlock.error?blockNotice('Не удалось загрузить идеи.'):ideas.length?ideas.map(i=>`<article class="idea" data-idea-id="${e(i.id)}" data-category="${e(i.category||'other')}" data-status="${e(i.story_status||'discussing')}" data-pinned="${i.is_pinned?1:0}" data-likes="${likesByIdea.get(i.id)?.like_count||0}" data-comments="${threads.get(i.id)?.length||0}" data-created="${new Date(i.created_at).getTime()}" data-search="${e([i.title,i.content,i.profiles?.display_name||''].join(' ').toLocaleLowerCase('ru-RU'))}" tabindex="-1"><div class="idea-meta"><div class="idea-author">${actorAvatar(i.profiles?.display_name || 'Участник',photoUrl(i.profiles))}<span>${e(i.profiles?.display_name || 'Участник')}</span></div><span>·</span><time datetime="${e(i.created_at)}">${e(date(i.created_at))}</time></div><div class="idea-tags"><span class="chip">${e(ideaCategories[i.category]||'Другое')}</span><span class="chip story-status" data-status="${e(i.story_status||'discussing')}">${e(ideaStatuses[i.story_status]||'Обсуждаем')}</span><span class="chip pinned-label" ${i.is_pinned?'':'hidden'}>Закреплено</span></div><h2>${e(i.title)}</h2>${ideaText(i)}${media(i)}<div class="idea-toolbar">${likeButton(i)}<button type="button" class="button secondary small share-toggle" aria-label="Поделиться идеей" aria-expanded="false" aria-controls="share-${e(i.id)}">${actionIcon('share')}<span>Поделиться</span></button>${i.user_id===user?.id?`<button type="button" class="button secondary icon-button edit-idea" data-id="${e(i.id)}" aria-label="Редактировать идею" title="Редактировать идею">${actionIcon('edit')}</button>`:''}${i.user_id===user?.id||admin?`<button type="button" class="button secondary icon-button delete-idea" data-id="${e(i.id)}" aria-label="Удалить идею" title="Удалить идею">${actionIcon('trash')}</button>`:''}</div>${sharing(i)}${editor(i)}${ideaReview(i)}${discussion(i)}</article>`).join(''):empty('Первая идея может быть вашей','Что стало с героями за одиннадцать лет? Какую историю хочется завершить? Предложите свою версию финала.','III')}<div class="ideas-no-results" hidden>${empty('Ничего не найдено','Измените запрос или сбросьте фильтры.')}</div></section></div>`;
}
const loginIcons = {
  google: `<svg class="provider-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12" fill="#fff"/><path fill="#4285F4" d="M20.64 12.2c0-.64-.06-1.25-.17-1.84H12v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.62Z"/><path fill="#34A853" d="M12 21c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.34 0-4.32-1.58-5.03-3.71H3.98v2.33A9 9 0 0 0 12 21Z"/><path fill="#FBBC05" d="M6.97 13.71A5.4 5.4 0 0 1 6.69 12c0-.59.1-1.17.28-1.71V7.96H3.98A9 9 0 0 0 3 12c0 1.45.35 2.82.98 4.04l2.99-2.33Z"/><path fill="#EA4335" d="M12 6.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A8.65 8.65 0 0 0 12 3a9 9 0 0 0-8.02 4.96l2.99 2.33C7.68 8.16 9.66 6.58 12 6.58Z"/></svg>`,
  telegram: `<svg class="provider-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path fill="#fff" d="m5.2 11.5 12.1-4.7c.56-.2 1.05.14.87.96l-2.06 9.7c-.15.69-.56.85-1.13.53l-3.14-2.32-1.52 1.46c-.17.17-.31.31-.64.31l.23-3.19 5.8-5.24c.25-.23-.06-.35-.39-.13l-7.17 4.52-3.09-.96c-.67-.21-.68-.67.14-.99Z"/></svg>`
};
function authPage(page) {
  if(demoMode) return `<section class="auth"><h1>${page==='register'?'Присоединиться к фильму':'Войти в проект'}</h1><p class="muted">В финальной версии здесь будет вход через выбранные вами сервисы.</p><div class="panel"><div class="form"><h2>Посмотреть кабинет</h2><p class="help">Сейчас вход демонстрационный: реальные аккаунты не создаются, пароль не нужен.</p><button class="button demo-enter" data-role="actor">Войти как тестовый актёр</button><button class="button secondary demo-enter" data-role="organizer">Войти как организатор и актёр</button><hr><span class="help">Варианты будущего входа</span><div class="auth-providers"><span>Google</span><span>Telegram</span><span>VK ID</span></div></div></div></section>`;
  if(user && !['reset'].includes(page))return heading('Вы уже вошли',`Аккаунт: ${profile?.display_name || user.email || 'Участник'}`)+'<a class="button" href="#/profile">К моей анкете</a>';
  return `<section class="auth"><h1>${page==='register'?'Присоединиться к фильму':'Войти в проект'}</h1><p class="muted">При первом входе аккаунт участника создаётся автоматически.</p>${offline()}<div class="panel"><div class="form"><button class="button full oauth-login" data-provider="google" id="google-login" ${!configured?'disabled':''}>${loginIcons.google}<span>Войти через Google</span></button><button class="button secondary full oauth-login" data-provider="custom:telegram" id="telegram-login" ${!configured?'disabled':''}>${loginIcons.telegram}<span>Войти через Telegram</span></button></div><p class="help">Чтобы вернуться к своей анкете, используйте тот же способ входа.</p><p class="form-error" id="oauth-error" role="alert"></p><p class="help">После входа можно заполнить анкету и предложить идеи.<br><a class="text-link" href="#/privacy">Как используются ваши данные</a></p></div></section>`;
}
const assignedCharacterForm=c=>`<details class="profile-character"><summary>${e(c.name)}</summary><form class="form assigned-character-form" data-id="${e(c.id)}">${field('Имя персонажа','name',{max:200,value:c.name})}${area('Краткое описание','description',{max:5000,value:c.description})}${area('Характер','personality',{max:5000,value:c.personality})}${area('Особенности','traits',{required:false,max:5000,value:c.traits})}${area('Связи с героями','relationships',{required:false,max:5000,value:c.relationships})}${area('История','history',{required:false,max:10000,value:c.history})}${errors}<button class="button" type="submit">Сохранить персонажа</button><span class="help">Изменения появятся в публичной карточке персонажа.</span></form></details>`;
const feedbackLabels={suggestion:'Предложение по сайту',bug:'Ошибка на сайте',other:'Другое'};
function feedbackCard(item,organizer=false){
 return `<article class="notification-message ${item.read_at?'':'unread'}"><div class="idea-meta">${organizer?`<span>${e(item.profiles?.display_name||'Участник')}</span><span>·</span>`:''}<span>${e(feedbackLabels[item.category]||'Другое')}</span><time datetime="${e(item.created_at)}">${e(date(item.created_at))}</time></div><h3>${e(item.title)}</h3><p>${e(item.message)}</p>${item.read_at?'<span class="help">Прочитано администратором</span>':organizer?`<button type="button" class="button secondary small read-feedback" data-id="${e(item.id)}">Отметить прочитанным</button>`:'<span class="help">Отправлено администратору</span>'}</article>`;
}
function feedbackPanel(items){
 return `<section class="panel feedback-panel"><details><summary>Написать администратору</summary><div class="feedback-body"><p class="help">Предложения по работе сайта, ошибки и другие вопросы. Обращение видите только вы и администратор.</p><form id="feedback-form" class="form"><label class="field"><span>Тип обращения</span><select name="category">${Object.entries(feedbackLabels).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>${field('Тема','title_text',{max:120})}${area('Сообщение','message_text',{max:5000,placeholder:'Опишите предложение или ошибку. Если что-то не работает, укажите устройство и браузер.'})}${errors}<button class="button" type="submit">Отправить администратору</button></form></div></details><details class="feedback-history"><summary>Мои обращения <span class="comment-count">${items.length}</span></summary><div class="feedback-body"><button type="button" class="button secondary small refresh-feedback">Обновить</button>${items.length?items.map(item=>feedbackCard(item)).join(''):'<p class="help">Вы пока не отправляли обращения.</p>'}</div></details></section>`;
}
function adminFeedbackPanel(items){
 const unread=items.filter(item=>!item.read_at).length;
 return `<section class="panel admin-block" id="admin-feedback"><h2>Обращения участников · ${unread} новых</h2><button type="button" class="button secondary small refresh-feedback">Обновить</button><p class="help">Сообщения о работе сайта. Сначала показаны непрочитанные.</p>${items.length?[...items].sort((a,b)=>Number(Boolean(a.read_at))-Number(Boolean(b.read_at))).map(item=>feedbackCard(item,true)).join(''):'<p class="help">Обращений пока нет.</p>'}</section>`;
}
function notificationInbox(messages,error=null){
 const unread=messages.filter(n=>!n.read_at).length;
 return `<details class="notification-inbox" ${notificationsOpen?'open':''}><summary aria-label="Уведомления: ${unread} непрочитанных"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 20h4"/></svg><span>Уведомления</span><b class="notification-count">${unread}</b></summary><div class="notification-list">${error?blockNotice('Уведомления временно недоступны.'):''}<button class="button secondary small refresh-notifications" type="button">Обновить</button>${messages.length?messages.map(n=>`<article class="notification-message ${n.read_at?'':'unread'}"><div class="idea-meta"><span>Организатор</span><time datetime="${e(n.created_at)}">${e(date(n.created_at))}</time></div><h3>${e(n.title)}</h3><p>${e(n.message)}</p>${n.read_at?'<span class="help">Прочитано</span>':`<button type="button" class="button secondary small read-notification" data-id="${e(n.id)}">Отметить прочитанным</button>`}</article>`).join(''):'<p class="help">Сообщений пока нет.</p>'}<p class="help">Сообщения обновляются автоматически; можно обновить вручную.</p></div></details>`;
}
function foldAdminSections(){
 for(const id of ['admin-apps','admin-lore','admin-characters','admin-assignments','admin-feedback','admin-notifications']){
  const section=document.getElementById(id);if(!section)continue;
  const title=section.querySelector('h2'),label=title?.textContent||id;title?.remove();
  const details=document.createElement('details');details.className='admin-spoiler';details.dataset.section=id;details.open=openAdminSections.has(id);
  const summary=document.createElement('summary');summary.textContent=label;
  const body=document.createElement('div');body.className='admin-spoiler-body';while(section.firstChild)body.append(section.firstChild);
  details.append(summary,body);section.append(details);
  details.ontoggle=()=>{if(!details.isConnected)return;if(details.open)openAdminSections.add(id);else openAdminSections.delete(id);};
 }
}
async function profilePage() {
  if(!user)return heading('Анкета актёра','Расскажите о себе, чтобы организатор мог рассмотреть вашу кандидатуру.')+lock('Сначала создайте аккаунт','После входа вы сможете отправить анкету и вернуться к ней позже.');
  const blocks=await Promise.all([
    readBlock(query(db.from('applications').select('*').eq('user_id',user.id).maybeSingle())),
    readBlock(query(db.from('character_assignments').select('*').eq('user_id',user.id))),readBlock(rows('characters','sort_order')),
    readBlock(query(db.from('telegram_connections').select('user_id,enabled,connected_at').eq('user_id',user.id).maybeSingle())),
    readBlock(query(db.from('site_feedback').select('*').eq('sender_id',user.id).order('created_at',{ascending:false})))
  ]);
  const [app,assignments,chars,telegram,feedback]=blocks.map((block,index)=>block.data??([1,2,4].includes(index)?[]:null));
  const messages=notificationState.userId===user.id?notificationState.messages:[];
  const assigned=new Set(assignments.map(a=>a.character_id));
  const personalCharacters=chars.filter(c=>assigned.has(c.id));
  return heading('Мой профиль',app?'Анкета отправлена. Чтобы изменить её, нажмите «Редактировать анкету».':'Заполните анкету, чтобы присоединиться к фильму.',notificationInbox(messages,notificationState.error))+
    `<div class="grid"><div class="profile-main"><section class="panel">${blocks[0].error?blockNotice('Анкета временно недоступна. Не удалось загрузить сохранённые данные.'):''}<div ${blocks[0].error?'hidden':''}>${app?'<details class="application-editor"><summary>Редактировать анкету</summary><div class="application-editor-body">':''}<form id="application-form" class="form"><div class="section-head"><h2>Участие в фильме</h2>${app?`<span class="status">${statusLabels[app.status]}</span>`:''}</div>${field('Имя и фамилия','display_name',{auto:'name',max:100,value:profile?.display_name || user.user_metadata?.display_name})}<div class="field-row">${field('Город','city',{max:100,value:app?.city})}<label class="field"><span>Снимались в прошлых частях?</span><select name="participation"><option value="new" ${app?.participation==='new'?'selected':''}>Нет, хочу присоединиться</option><option value="returning" ${app?.participation==='returning'?'selected':''}>Да, возвращаюсь в проект</option></select></label></div>${field('Прежняя или желаемая роль','role_name',{required:false,max:200,value:app?.role_name,placeholder:'Персонаж или «готов рассмотреть варианты»'})}${area('Опыт и немного о себе (необязательно)','experience',{required:false,max:5000,value:app?.experience})}${area('Готовность к съёмкам (необязательно)','availability',{required:false,max:2000,value:app?.availability,placeholder:'Когда можете участвовать? Есть ли ограничения по времени или поездкам?'})}${field('Контакт для организатора (необязательно)','contact',{required:false,max:200,value:app?.contact,placeholder:'Почта, телефон или Telegram'})}${errors}<button class="button" type="submit">${app?'Сохранить изменения':'Отправить анкету'}</button></form>${app?'</div></details>':''}</div></section><section class="panel profile-characters">${blocks[1].error||blocks[2].error?blockNotice('Мои персонажи временно недоступны.'):''}<h2>Мои персонажи</h2>${personalCharacters.length?personalCharacters.map(assignedCharacterForm).join(''):'<p class="help">Здесь появятся персонажи, которых за вами закрепит организатор.</p>'}</section></div><aside class="panel"><span class="eyebrow">Ваш аккаунт</span>${actorAvatar(profile?.display_name,photoUrl(profile))}<form id="avatar-form" class="form avatar-form"><label class="field"><span>Фото профиля</span><input type="file" name="avatar" accept="image/jpeg,image/png,image/webp" required></label><span class="help">${demoMode?'В демо загруженные файлы доступны до перезагрузки страницы. ':''}JPG, PNG или WebP, до 5 МБ. Фото утверждённого актёра видно всем.</span>${errors}<button class="button secondary small" type="submit">Загрузить аватарку</button></form><p>${e(user.email || profile?.display_name || 'Участник Telegram')}</p><p class="help">Контакты, опыт и доступность видны только вам и организатору.</p>${app?`<hr><p class="status">${statusLabels[app.status]}</p><p class="help">${app.status==='accepted'?'Вы в составе! Вы можете редактировать анкету; имя и роль обновятся в составе после сохранения.':app.status==='declined'?'В этот раз кандидатура не выбрана. Вы можете обновить анкету и связаться с организатором.':'Организатор рассмотрит вашу анкету и свяжется с вами.'}</p>`:''}<hr><div class="telegram-settings">${blocks[3].error?blockNotice('Статус подключения Telegram временно недоступен.'):''}<h3>Уведомления в Telegram</h3><p class="help">${telegram?.enabled?'Подключены. Сообщения организатора будут приходить и в личку бота.':'Откройте бота по кнопке ниже и нажмите «Запустить», чтобы получать сообщения организатора.'}</p>${telegram?.enabled?`<button type="button" class="button secondary full" id="disconnect-telegram">${loginIcons.telegram}<span>Отключить Telegram</span></button>`:`<button type="button" class="button secondary full" id="connect-telegram">${loginIcons.telegram}<span>Подключить Telegram</span></button><a class="button full" id="telegram-connect-link" hidden target="_blank" rel="noopener noreferrer">Открыть бота</a>`}<button type="button" class="text-link" id="refresh-telegram">Проверить подключение</button><p class="help" id="telegram-settings-status" role="status"></p></div><hr><button class="button secondary full" id="logout">Выйти из аккаунта</button></aside></div>${blocks[4].error?blockNotice('История обращений временно недоступна.'):''}${feedbackPanel(feedback)}`;
}
async function adminPage() {
  if(!user||!admin)return heading('Управление фильмом','Эта страница доступна организатору.')+'<a class="button secondary" href="#/cast">К актёрскому составу</a>';
  const blocks=await Promise.all([readBlock(query(db.from('applications').select('*, profiles(display_name)').order('created_at',{ascending:false}))),readBlock(rows('lore_chapters','sort_order')),readBlock(rows('characters','sort_order')),readBlock(query(db.from('character_assignments').select('*'))),readBlock(query(db.from('profiles').select('id,display_name').order('display_name'))),readBlock(query(db.from('site_feedback').select('*, profiles(display_name)').order('created_at',{ascending:false})))]);
  const [apps,chapters,chars,assignments,profiles,feedback]=blocks.map(block=>block.data||[]);
  const assignedActors=new Map(assignments.map(a=>[a.character_id,a.user_id]));
  const actorOptions=apps.filter(a=>a.status==='accepted');
  return heading('Управление фильмом','Рассмотрите анкеты, опубликуйте лор и добавьте персонажей.')+blocks.map((block,index)=>block.error?blockNotice(['Анкеты','Лор','Персонажи','Распределение ролей','Список участников','Обращения'][index]+' временно недоступны.'):'').join('')+`<div class="pill-nav"><a href="#admin-apps" data-scroll="admin-apps">Анкеты · ${apps.length}</a><a href="#admin-lore" data-scroll="admin-lore">Лор · ${chapters.length}</a><a href="#admin-characters" data-scroll="admin-characters">Персонажи · ${chars.length}</a><a href="#admin-assignments" data-scroll="admin-assignments">Распределение ролей</a><a href="#admin-feedback" data-scroll="admin-feedback">Обращения · ${feedback.filter(f=>!f.read_at).length}</a><a href="#admin-notifications" data-scroll="admin-notifications">Уведомления</a></div><section id="admin-apps" class="admin-block"><div class="section-head"><h2>Анкеты актёров</h2></div>${apps.length?apps.map(a=>`<article class="admin-app"><h3>${e(a.profiles?.display_name || 'Участник')} <span class="status">${statusLabels[a.status]}</span></h3><p>${e(a.city)} · ${a.participation==='returning'?'Прежний состав':'Новый актёр'}</p><p><b>Роль:</b> ${e(a.role_name||'Не указана')}</p><p><b>Опыт:</b> ${e(a.experience)}</p><p><b>Готовность:</b> ${e(a.availability)}</p><p><b>Контакт:</b> ${e(a.contact)}</p><div class="idea-actions"><button class="button small review" data-id="${a.id}" data-status="accepted">Утвердить</button><button class="button secondary small review" data-id="${a.id}" data-status="declined">Отклонить</button><button class="button secondary small review" data-id="${a.id}" data-status="submitted">На рассмотрение</button></div></article>`).join(''):empty('Анкет пока нет','Поделитесь ссылкой на сайт с прежними актёрами и кандидатами.')}</section><div class="admin-grid"><section class="panel admin-block" id="admin-lore"><h2>Лор трилогии</h2><form id="lore-form" class="form"><input type="hidden" name="id">${field('Название раздела','title',{max:200})}${field('Порядок раздела','sort_order',{type:'number',value:chapters.length+1})}${area('Текст раздела','content',{max:30000})}${errors}<button class="button">Сохранить раздел</button><button class="button secondary" type="reset">Очистить форму</button></form>${chapters.map(c=>`<div class="cast-card"><div><h3>${e(c.title)}</h3><button class="button secondary small edit-lore" data-id="${c.id}">Изменить</button></div></div>`).join('')}</section><section class="panel admin-block" id="admin-characters"><h2>Персонажи</h2><form id="character-form" class="form"><input type="hidden" name="id">${field('Имя персонажа','name',{max:200})}${field('Порядок карточки','sort_order',{type:'number',value:chars.length+1})}${area('Краткое описание','description',{max:5000})}${area('Характер','personality',{max:5000})}${area('Особенности','traits',{required:false,max:5000})}${area('Связи с героями','relationships',{required:false,max:5000})}${area('История в трилогии','history',{required:false,max:10000})}<label class="field"><span>Роль в финальном фильме</span><select name="casting_status"><option value="open">Нужен актёр</option><option value="cast">Актёр выбран</option><option value="uncertain">Участие уточняется</option></select></label>${errors}<button class="button">Сохранить персонажа</button><button class="button secondary" type="reset">Очистить форму</button></form>${chars.map(c=>`<div class="cast-card"><div><h3>${e(c.name)}</h3><button class="button secondary small edit-character" data-id="${c.id}">Изменить</button></div></div>`).join('')}</section></div><section class="panel admin-block" id="admin-assignments"><h2>Актёры и персонажи</h2><p class="help">Выберите актёра из утверждённого состава. Он сможет редактировать карточку персонажа в своём профиле. За актёром можно закрепить несколько персонажей.</p>${chars.map(c=>`<form class="form assignment-form" data-id="${e(c.id)}"><h3>${e(c.name)}</h3><label class="field"><span>Актёр</span><select name="actor_user"><option value="">Не назначен</option>${actorOptions.map(a=>`<option value="${e(a.user_id)}" ${assignedActors.get(c.id)===a.user_id?'selected':''}>${e(a.profiles?.display_name||'Участник')}</option>`).join('')}</select></label>${errors}<button class="button secondary small" type="submit">Сохранить назначение</button></form>`).join('')}</section>${adminFeedbackPanel(feedback)}<section class="panel admin-block" id="admin-notifications"><h2>Отправить уведомление</h2><div class="telegram-admin"><button type="button" class="button secondary small" id="setup-telegram">Настроить бота</button><button type="button" class="button secondary small" id="retry-telegram">Повторить / дослать в Telegram</button><p class="help" id="telegram-admin-status" role="status"></p></div><form id="notification-form" class="form"><label class="field"><span>Кому</span><select name="recipient_user"><option value="">Всем участникам</option>${profiles.map(p=>`<option value="${e(p.id)}">${e(p.display_name)}</option>`).join('')}</select></label>${field('Заголовок','title_text',{max:120})}${area('Сообщение','message_text',{max:5000,placeholder:'Обновления сайта, время и место сбора на съёмки…'})}${errors}<button class="button" type="submit">Отправить уведомление</button><span class="help">Сообщение появится на сайте и отправится в Telegram, если получатель подключил бота.</span></form></section>`;
}
function safeUrl(url){try{return ['https:','http:'].includes(new URL(url).protocol)}catch{return false}}
function privacyPage(){return heading('Ваши данные','Информация нужна для сбора команды и совместной работы над фильмом.')+`<div class="panel" style="max-width:800px"><h2>Что увидят другие</h2><p class="muted">Имя, роль и фото профиля утверждённых актёров доступны посетителям. Идеи, комментарии, вложения и имена их авторов доступны всем посетителям. Лор и персонажи открыты всем.</p><h2>Что видит организатор</h2><p class="muted">Город, прежнее участие, опыт, готовность к съёмкам, контакт из анкеты. Другие участники не имеют доступа к этим полям. Обращения о работе сайта видны только их автору и администратору.</p><h2>Аккаунт и удаление данных</h2><p class="muted">Имя и идентификатор аккаунта Google или Telegram используются для входа через Supabase. При входе через Google также используется почта. Пароли ваших аккаунтов сайт не получает; номер телефона и доступ к сообщениям Telegram не запрашиваются. Свои идеи и комментарии можно удалить на странице обсуждения, анкету — исправить в личном кабинете. Для удаления аккаунта и анкеты обратитесь к организатору по известному вам контакту проекта.</p><p class="help">Перед публичным запуском организатору необходимо добавить сюда своё имя и контакт для запросов об удалении данных.</p></div>`}
async function submit(form,fn) {
  const button=form.querySelector('button[type="submit"],button:not([type])');button.disabled=true;
  form.querySelector('.form-error').textContent='';form.querySelector('.form-success').textContent='';
  try{await fn(Object.fromEntries(new FormData(form)));}catch(error){form.querySelector('.form-error').textContent=readableError(error);}finally{if(button.isConnected)button.disabled=false;}
}
async function loadIdentity() {
  if(!db)return;
  const {data:{session},error}=await readRequired(db.auth.getSession());if(error)throw error;user=session?.user || null;admin=false;profile=null;
  if(user){const blocks=await Promise.all([readBlock(query(db.from('profiles').select('*').eq('id',user.id).maybeSingle())),readBlock(query(db.from('admin_users').select('user_id').eq('user_id',user.id)))]);profile=blocks[0].data;admin=(blocks[1].data||[]).length>0;}
}
function wire(page){
  document.querySelectorAll('.retry-block').forEach(button=>button.onclick=()=>render());
  if(page==='cast'){
    const counter=document.getElementById('home-idea-count');
    if(counter)readBlock((async()=>{if(!db)return 0;const result=await db.from('ideas').select('id',{count:'exact',head:true});if(result.error)throw result.error;return result.count??result.data?.length??0;})()).then(result=>{if(!counter.isConnected)return;counter.textContent=result.error?'—':result.data;const error=document.getElementById('home-count-error');if(error){error.hidden=!result.error;error.textContent=result.error?'Счётчик временно недоступен':'';}});
  }

  if(page==='ideas'){
    if(sharedIdeaId())ideaFilters={search:'',category:'all',sort:ideaFilters.sort,status:'all'};
    for(const [key,id]of [['search','ideas-search'],['category','ideas-category'],['status','ideas-status'],['sort','ideas-sort']]){const input=document.getElementById(id);if(input){input.value=ideaFilters[key];input.addEventListener(key==='search'?'input':'change',()=>{ideaFilters[key]=input.value;applyIdeaFilters();});}}
    const clear=document.querySelector('.ideas-clear');if(clear)clear.onclick=()=>{ideaFilters={search:'',category:'all',sort:'new',status:'all'};for(const [key,id]of [['search','ideas-search'],['category','ideas-category'],['status','ideas-status'],['sort','ideas-sort']])document.getElementById(id).value=ideaFilters[key];applyIdeaFilters();};
    document.querySelectorAll('.idea-read-more').forEach(button=>button.onclick=()=>{const open=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(open));document.getElementById(button.getAttribute('aria-controls')).classList.toggle('is-collapsed',!open);button.textContent=open?'Свернуть':'Читать полностью';if(open)expandedIdeas.add(button.dataset.id);else expandedIdeas.delete(button.dataset.id);});
    document.querySelectorAll('.idea-review-form').forEach(form=>form.onsubmit=event=>{event.preventDefault();submit(form,async data=>{const pinned=form.elements.is_pinned.checked;await query(db.rpc('set_idea_review',{idea_uuid:form.dataset.id,review_status:data.story_status,pin_idea:pinned}));const card=form.closest('.idea');card.dataset.status=data.story_status;card.dataset.pinned=pinned?'1':'0';card.querySelector('.story-status').textContent=ideaStatuses[data.story_status];card.querySelector('.story-status').dataset.status=data.story_status;card.querySelector('.pinned-label').hidden=!pinned;form.querySelector('.form-success').textContent='Решение сохранено';applyIdeaFilters();});});
    applyIdeaFilters();
  }

  const feedbackForm=document.querySelector('#feedback-form');
  if(feedbackForm){restoreMessageDraft(feedbackForm,'feedback');feedbackForm.onsubmit=event=>{event.preventDefault();submit(feedbackForm,async data=>{
    const title=data.title_text.trim(),message=data.message_text.trim();
    if(!title||!message)throw new MediaError('Заполните тему и сообщение.');
    await query(db.from('site_feedback').insert({category:data.category,title,message}));
    feedbackForm.reset();clearFormDraft(feedbackForm);toast('Обращение отправлено администратору');await render();
  });};}
  document.querySelectorAll('.refresh-feedback').forEach(button=>button.onclick=()=>render());
  document.querySelectorAll('.read-feedback').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await query(db.rpc('read_site_feedback',{feedback_id:button.dataset.id}));await render();}catch(error){toast(readableError(error));button.disabled=false;}});

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
  document.querySelectorAll('[data-scroll]').forEach(a=>a.onclick=ev=>{ev.preventDefault();const target=document.getElementById(a.dataset.scroll),details=target?.querySelector('.admin-spoiler');if(details){details.open=true;openAdminSections.add(a.dataset.scroll);}target?.scrollIntoView?.({behavior:'smooth'});});
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
    clearFormDraft(application);await loadIdentity();toast('Анкета сохранена');render();
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
    try{await query(db.from('ideas').insert({user_id:user.id,title:data.title.trim(),content:data.content.trim(),category:data.category,attachments}));}
    catch(error){await removeFiles('idea-media',attachments.map(a=>a.path));throw error;}
    clearFormDraft(idea);toast('Идея опубликована');await render();
  });};
  document.querySelectorAll('.idea-login').forEach(link=>link.onclick=()=>{try{sessionStorage.setItem(pendingIdeaKey,JSON.stringify({id:link.dataset.id,time:Date.now()}));}catch{}});
  document.querySelectorAll('.idea-like').forEach(button=>button.onclick=async()=>{
    if(!user){try{sessionStorage.setItem(pendingIdeaKey,JSON.stringify({id:button.dataset.id,time:Date.now()}));}catch{}toast('Войдите, чтобы поставить лайк');go('login');return;}
    const shouldLike=button.getAttribute('aria-pressed')!=='true';button.disabled=true;
    try{
      const result=await query(db.rpc('set_idea_like',{target_idea:button.dataset.id,should_like:shouldLike}));
      const stats=Array.isArray(result)?result[0]:result;if(!stats)throw new Error('Like state unavailable');
      button.setAttribute('aria-pressed',String(Boolean(stats.liked)));button.querySelector('.like-count').textContent=stats.like_count;button.closest('.idea').dataset.likes=stats.like_count;applyIdeaFilters();
      const label=`${stats.liked?'Снять лайк':'Поставить лайк'}. Лайков: ${stats.like_count}`;button.setAttribute('aria-label',label);button.title=label;
    }catch(error){toast(readableError(error));}finally{button.disabled=false;}
  });
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
      try{await query(db.from('ideas').update({title:data.title.trim(),content:data.content.trim(),attachments:[...kept,...uploaded],category:data.category}).eq('id',current.id).select('id').single());}
      catch(error){await removeFiles('idea-media',uploaded.map(a=>a.path));throw error;}
      await removeFiles('idea-media',(current.attachments||[]).filter(a=>removed.has(a.path)).map(a=>a.path));
      clearFormDraft(form);toast('Идея обновлена');await render();
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
      clearFormDraft(form);openCommentThreads.add(form.dataset.ideaId);toast('Комментарий опубликован');await render();
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
      clearFormDraft(form);openCommentThreads.add(current.idea_id);toast('Комментарий обновлён');await render();
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
  const refreshNotifications=document.querySelector('.refresh-notifications');if(refreshNotifications)refreshNotifications.onclick=()=>{notificationsOpen=true;refreshHeaderNotifications();};
  document.querySelectorAll('.read-notification').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await query(db.rpc('read_notification',{notification_id:button.dataset.id}));notificationsOpen=true;const item=notificationState.messages.find(message=>message.id===button.dataset.id);if(item)item.read_at=new Date().toISOString();paintHeaderNotifications();}catch(error){toast(readableError(error));button.disabled=false;}});
  document.querySelectorAll('.assigned-character-form').forEach(form=>form.onsubmit=ev=>{ev.preventDefault();submit(form,async details=>{for(const key of Object.keys(details))details[key]=details[key].trim();await query(db.rpc('edit_assigned_character',{target_character:form.dataset.id,details}));clearFormDraft(form);form._draftBaseline=draftValues(form);form.querySelector('.form-success').textContent='Карточка персонажа сохранена';toast('Персонаж обновлён');});});
  const logout=document.querySelector('#logout');if(logout)logout.onclick=async()=>{logout.disabled=true;const {error}=await db.auth.signOut();if(error){toast(readableError(error));logout.disabled=false;return;}user=null;profile=null;admin=false;go('cast');};
  if(page==='admin'&&admin){
    document.querySelectorAll('.assignment-form').forEach(form=>form.onsubmit=ev=>{ev.preventDefault();submit(form,async data=>{await query(db.rpc('set_character_actor',{target_character:form.dataset.id,actor_user:data.actor_user||null}));form.querySelector('.form-success').textContent='Назначение сохранено';});});
    for(const [id,action] of [['setup-telegram','setup'],['retry-telegram','retry']]){const button=document.getElementById(id);if(button)button.onclick=async()=>{if(demoMode){toast('В демо сообщения остаются на сайте');return;}button.disabled=true;
      try{const {data,error}=await db.functions.invoke('telegram-notifications',{body:{action}});if(error)throw error;document.querySelector('#telegram-admin-status').textContent=action==='setup'?'Бот настроен. Участники могут подключить Telegram в профиле.':`Доставлено ${data.sent}, ошибок ${data.failed}, в очереди ${data.pending}. Если очередь не пуста, повторите позже.`;}
      catch{document.querySelector('#telegram-admin-status').textContent='Не удалось выполнить действие. Проверьте Secrets и настройки Edge Functions.';}
      finally{button.disabled=false;}
    };}
    const notification=document.querySelector('#notification-form');if(notification){restoreMessageDraft(notification);notification.onsubmit=ev=>{ev.preventDefault();submit(notification,async data=>{const count=await query(db.rpc('send_notification',{title_text:data.title_text.trim(),message_text:data.message_text.trim(),recipient_user:data.recipient_user||null}));notification.reset();clearFormDraft(notification);notification.querySelector('.form-success').textContent=`На сайте отправлено. Получателей: ${count}.`;
      if(!demoMode){try{const {data,error}=await db.functions.invoke('telegram-notifications',{body:{action:'dispatch'}});if(error)throw error;notification.querySelector('.form-success').textContent+=` Telegram: доставлено ${data.sent}, ошибок ${data.failed}, в очереди ${data.pending}.`;}
      catch{notification.querySelector('.form-success').textContent+=' Telegram пока не отправлен. Проверьте настройки и нажмите «Повторить / дослать». Сообщение на сайте сохранено.';}}});};}

    document.querySelectorAll('.review').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await query(db.rpc('review_application',{application_id:b.dataset.id,new_status:b.dataset.status}));toast('Статус изменён');render();}catch(err){toast(readableError(err));b.disabled=false;}});
    for(const [formId,table,editClass] of [['lore-form','lore_chapters','edit-lore'],['character-form','characters','edit-character']]){
      const form=document.getElementById(formId);if(!form)continue;
      form.onsubmit=ev=>{ev.preventDefault();submit(form,async data=>{const id=data.id;delete data.id;data.sort_order=Number(data.sort_order);for(const key of Object.keys(data))if(typeof data[key]==='string')data[key]=data[key].trim();await query(id?db.from(table).update(data).eq('id',id):db.from(table).insert(data));toast('Материалы сохранены');render();});};
      document.querySelectorAll('.'+editClass).forEach(b=>b.onclick=async()=>{try{const item=await query(db.from(table).select('*').eq('id',b.dataset.id).single());for(const [key,val]of Object.entries(item)){const input=form.elements.namedItem(key);if(input)input.value=val??'';}form.scrollIntoView({behavior:'smooth'});form.elements[1].focus();}catch(err){toast(readableError(err));}});
    }
  }
}
document.addEventListener('click',event=>{if(!event.target.closest('.header-notifications')){const panel=document.getElementById('header-inbox');if(panel)panel.hidden=true;document.querySelector('.header-bell')?.setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const panel=document.getElementById('header-inbox');if(panel)panel.hidden=true;document.querySelector('.header-bell')?.setAttribute('aria-expanded','false');}});
setInterval(()=>{if(!document.hidden)refreshHeaderNotifications();},45000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshHeaderNotifications();});
window.addEventListener('focus',()=>refreshHeaderNotifications());
window.addEventListener('beforeunload',savePageDrafts);
window.addEventListener('hashchange',()=>render());
window.matchMedia?.('(max-width:720px)').addEventListener('change',event=>{const composer=document.querySelector('.idea-proposal');if(composer)composer.open=!event.matches;const join=document.querySelector('.cast-join');if(join)join.open=!event.matches;});
let authTimer;
if(db)db.auth.onAuthStateChange((event,session)=>{
  // Defer database calls outside the Supabase auth callback lock.
  if(event==='PASSWORD_RECOVERY'){location.hash='/reset';}
  if(event==='SIGNED_OUT'){savePageDrafts();clearTimeout(authTimer);user=null;admin=false;profile=null;render();return;}
  if(event==='SIGNED_IN'||event==='USER_UPDATED'){
    // Supabase also emits SIGNED_IN when an existing session is confirmed on tab focus.
    // Redrawing for the same participant destroys in-progress forms unnecessarily.
    if(event==='SIGNED_IN'&&session?.user?.id===user?.id)return;
    clearTimeout(authTimer);authTimer=setTimeout(async()=>{try{if(event==='SIGNED_IN'&&session?.user?.id===user?.id)return;savePageDrafts();await loadIdentity();restoreSharedIdea();if(route()!=='reset')render();}catch(err){toast(readableError(err));}},0);
  }
});
frame(route());
try{await loadIdentity();restoreSharedIdea();}catch(err){toast(readableError(err));}
await render();
