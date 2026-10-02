// Confirmed project content and local interface fixtures. This is not authentication.
const actorId='demo-actor',ownerId='demo-owner';
const fixed='2026-10-02T12:00:00Z';
const initial={
 profiles:[{id:actorId,display_name:'Алексей • тестовый актёр'},{id:ownerId,display_name:'Организатор проекта'},{id:'demo-two',display_name:'Мария • тестовый актёр'}],
 admin_users:[{user_id:ownerId}],
 cast_members:[{id:'cast-one',display_name:'Тестовый актёр 01',role_name:'Роль уточняется',participation:'returning',created_at:fixed},{id:'cast-two',display_name:'Тестовый актёр 02',role_name:'Роль уточняется',participation:'returning',created_at:fixed},{id:'cast-owner',user_id:ownerId,display_name:'Организатор проекта',role_name:'Фёдор',participation:'returning',created_at:fixed}],
 characters:[
 {id:'char-one',name:'Жора',description:'Обычный новокузнецкий парень, попавший не в то место и не в то время. Вынужден бороться с Доном криминальными методами.',personality:'Характер уточним по полному разбору.',traits:'Борется с Доном криминальными методами.',relationships:'Противник Дона Потника. Карпуха — член банды Жоры.',history:'Сведения из прежнего разбора. Конфликт связан с пропавшей партией кокаина и долгом в миллион долларов.',casting_status:'uncertain',sort_order:1},
 {id:'char-two',name:'Дон Потник',description:'Унаследовал преступную империю. Его конфликт с Жорой — одна из центральных линий.',personality:'Характер уточним по полному разбору.',traits:'Стоит во главе собственной группировки.',relationships:'Противостоит Жоре. Туз — его правая рука. Фёдор и Дима Черен — члены его банды.',history:'В прежнем разборе отмечены похищения, убийства и перестрелка в ходе конфликта.',casting_status:'uncertain',sort_order:2},
 {id:'char-three',name:'Туз',description:'Правая рука Дона Потника.',personality:'Подробное описание пока не перенесено.',traits:'Близкий участник команды Дона.',relationships:'Связан с Доном Потником.',history:'Данные из доступного контекста прежнего разбора.',casting_status:'uncertain',sort_order:4},
 {id:'char-four',name:'Святослав',description:'Его роль связана с пленением и подозрением в предательстве.',personality:'Не определён в доступном кратком разборе.',traits:'Его роль и связь с информатором остаются нераскрытыми.',relationships:'Связи нужно уточнить по полному разбору.',history:'Пленение Святослава — одна из отмеченных линий. Не делаем вывод о предательстве без подтверждения.',casting_status:'uncertain',sort_order:5},
 {id:'char-five',name:'Паша',description:'В прежнем разборе отмечена его гибель.',personality:'Подробности нужно дополнить.',traits:'Возвращение в финальном фильме требует сюжетного решения.',relationships:'Подробности нужно дополнить.',history:'Гибель отмечена в доступном контексте. Обстоятельства уточним по полному разбору.',casting_status:'uncertain',sort_order:6},
 {id:'char-six',name:'Ваня',description:'В прежнем разборе характеризуется как надёжный участник.',personality:'Надёжность — отмеченная черта; остальное нужно уточнить.',traits:'Подробности нужно дополнить.',relationships:'Подробности нужно дополнить.',history:'Данные из доступного контекста прежнего разбора.',casting_status:'uncertain',sort_order:7},
 {id:'char-seven',name:'Химик',description:'Персонаж, связанный с наркотиками.',personality:'Подробности нужно дополнить.',traits:'Связь с наркотиками отмечена в прежнем разборе.',relationships:'Подробности нужно дополнить.',history:'Роль в финальном фильме пока не определена.',casting_status:'uncertain',sort_order:8},
 {id:'char-eight',name:'Джорданио Быхулиос',description:'Загадочный персонаж.',personality:'В доступном контексте нет подробностей.',traits:'Связан с отдельной группировкой.',relationships:'Серёга Авиаторы — его правая рука. Неясно, на чьей стороне Джорданио.',history:'Внезапно появляется в конце второй серии. Возможно, играет в свою игру.',casting_status:'uncertain',sort_order:3},
 {id:'char-fedor',name:'Фёдор',description:'Член банды Дона Потника.',personality:'',traits:'',relationships:'Член банды Дона Потника.',history:'Роль исполняет организатор проекта.',casting_status:'cast',sort_order:9},
 {id:'char-karpuha',name:'Карпуха',description:'Член банды Жоры.',personality:'',traits:'',relationships:'Член банды Жоры.',history:'',casting_status:'uncertain',sort_order:10},
 {id:'char-dima',name:'Дима Черен',description:'Член банды Дона Потника.',personality:'',traits:'',relationships:'Член банды Дона Потника.',history:'',casting_status:'uncertain',sort_order:11},
 {id:'char-aviatory',name:'Серёга Авиаторы',description:'Правая рука Джорданио Быхулиоса.',personality:'',traits:'',relationships:'Правая рука Джорданио Быхулиоса.',history:'',casting_status:'uncertain',sort_order:12}
 ],
 lore_chapters:[
 {id:'lore-one',title:'Основной конфликт',sort_order:1,content:'Жора и Дон Потник противостоят друг другу из-за пропавшей партии кокаина и долга в миллион долларов.\n\nВ конфликте отмечены похищения, убийства и перестрелка.'},
 {id:'lore-two',title:'Герои и группировки',sort_order:2,content:'Дон Потник унаследовал преступную империю. Жора, обычный новокузнецкий парень, попавший не в то место и не в то время, вынужден бороться с Доном криминальными методами.\n\nВ конце второй серии внезапно появляется загадочный персонаж Джорданио Быхулиос.'},
 {id:'lore-three',title:'Что осталось открытым',sort_order:3,content:'Непонятно, на чьей стороне Джорданио — или он вовсе играет в свою игру.'}
 ],
 ideas:[{id:'idea-one',user_id:ownerId,title:'Одиннадцать лет спустя',content:'Предлагаю начать финальную часть со встречи прежних героев. Каждый помнит прошлое по-своему — через их разговор постепенно узнаём, что произошло между фильмами.\n\nПример идеи для проверки страницы обсуждения.',created_at:fixed},{id:'idea-two',user_id:actorId,title:'Новый герой как точка входа',content:'Новый персонаж может познакомиться с прежней командой вместе со зрителем. Это поможет естественно напомнить события первых частей, без длинного вступления.\n\nТестовое предложение, не часть канона.',created_at:'2026-10-01T12:00:00Z'}],
 applications:[{id:'app-one',user_id:actorId,city:'Новосибирск',participation:'returning',role_name:'Роль уточняется',experience:'Снимался в прошлой части. Это тестовая анкета, все сведения вымышлены.',availability:'Готов обсуждать съёмки по выходным.',contact:'Тестовый контакт — не настоящий',portfolio:'',status:'submitted',created_at:fixed},{id:'app-owner',user_id:ownerId,city:'',participation:'returning',role_name:'Фёдор',experience:'Играю Фёдора — члена банды Дона Потника.',availability:'',contact:'Тестовый контакт — не настоящий',portfolio:'',status:'accepted',created_at:fixed}]
};
const storageKey='final-chapter-front-demo-v2';
let state=structuredClone(initial),role='guest';
try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved?.data&&['guest','actor','organizer'].includes(saved.role)){state=saved.data;role=saved.role;}}catch{}
// Refresh requested canonical demo content while keeping locally edited forms and ideas.
try{
 const saved=JSON.parse(localStorage.getItem(storageKey));
 if(saved?.data && (saved.contentVersion||0)<3){
  const order=['char-one','char-two','char-eight','char-three','char-four','char-five','char-six','char-seven'];
  for(const character of state.characters){const index=order.indexOf(character.id);if(index>=0)character.sort_order=index+1;if(character.id==='char-eight')character.description='Загадочный персонаж.';}
  for(const idea of state.ideas){if(idea.title==='Десять лет спустя')idea.title='Одиннадцать лет спустя';}
 }
}catch{}
try{
 const saved=JSON.parse(localStorage.getItem(storageKey));
 if(saved?.data && (saved.contentVersion||0)<4){
  for(const chapter of initial.lore_chapters){const old=state.lore_chapters.find(item=>item.id===chapter.id);if(old)Object.assign(old,chapter);else state.lore_chapters.push(structuredClone(chapter));}
  for(const character of initial.characters){const old=state.characters.find(item=>item.id===character.id);if(!old)state.characters.push(structuredClone(character));else if(['char-one','char-two','char-eight'].includes(character.id))Object.assign(old,character);}
  const ownerProfile=state.profiles.find(item=>item.id===ownerId);if(ownerProfile?.display_name==='Организатор • демо')ownerProfile.display_name='Организатор проекта';
  for(const table of ['applications','cast_members']){const record=initial[table].find(item=>item.user_id===ownerId);if(record){const existing=state[table].find(item=>item.user_id===ownerId);if(existing)existing.role_name='Фёдор';else state[table].push(structuredClone(record));}}
 }
}catch{}
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify({data:state,role,contentVersion:4}));}catch{}};


export const getDemoRole=()=>role;
export function setDemoRole(next){role=next;save();}
export function resetDemo(){state=structuredClone(initial);role='guest';save();}
const currentUser=()=>role==='guest'?null:{id:role==='organizer'?ownerId:actorId,email:role==='organizer'?'organizer@example.test':'actor@example.test',user_metadata:{display_name:role==='organizer'?'Организатор проекта':'Алексей • тестовый актёр'}};
const id=()=>globalThis.crypto?.randomUUID?.() || 'demo-'+Date.now()+'-'+Math.random().toString(36).slice(2);
class DemoQuery{
 constructor(table){this.table=table;this.filters=[];this.action='select';}
 select(columns='*'){this.columns=columns;return this;}
 order(column,{ascending=true}={}){this.sort={column,ascending};return this;}
 eq(column,value){this.filters.push([column,value]);return this;}
 maybeSingle(){this.isSingle=true;return this;}
 single(){this.isSingle=true;return this;}
 insert(payload){this.action='insert';this.payload=payload;return this;}
 update(payload){this.action='update';this.payload=payload;return this;}
 delete(){this.action='delete';return this;}
 then(resolve,reject){return this.execute().then(resolve,reject);}
 async execute(){
  const table=state[this.table]||[], matches=row=>this.filters.every(([key,value])=>row[key]===value);
  let data=table.filter(matches);
  if(this.action==='insert'){const item={id:id(),created_at:new Date().toISOString(),...this.payload};if(this.table==='applications')item.status='submitted';table.push(item);data=[item];save();}
  if(this.action==='update'){data.forEach(item=>Object.assign(item,this.payload));save();}
  if(this.action==='delete'){state[this.table]=table.filter(row=>!matches(row));data=[];save();}
  data=data.map(row=>({...row}));
  if(this.columns?.includes('profiles('))data=data.map(row=>({...row,profiles:state.profiles.find(p=>p.id===row.user_id)}));
  if(this.sort){const {column,ascending}=this.sort;data.sort((a,b)=>a[column]>b[column]?(ascending?1:-1):a[column]<b[column]?(ascending?-1:1):0);}
  return {data:this.isSingle?(data[0]||null):data,error:null};
 }
}
export const demoClient={
 from:table=>new DemoQuery(table),
 auth:{
 getSession:async()=>({data:{session:currentUser()?{user:currentUser()}:null},error:null}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
 signOut:async()=>{setDemoRole('guest');return {error:null};}
 },
 rpc:async(name,{application_id,new_status})=>{
  if(role!=='organizer')return {data:null,error:{code:'42501'}};
  const app=state.applications.find(a=>a.id===application_id);if(!app)return {data:null,error:{message:'Not found'}};
  app.status=new_status;
  state.cast_members=state.cast_members.filter(c=>c.user_id!==app.user_id&&!(c.id==='cast-one'&&app.user_id===actorId));
  if(new_status==='accepted')state.cast_members.push({id:id(),user_id:app.user_id,display_name:state.profiles.find(p=>p.id===app.user_id)?.display_name||'Участник',role_name:app.role_name,participation:app.participation,created_at:new Date().toISOString()});
  save();return {data:null,error:null};
 }
};
