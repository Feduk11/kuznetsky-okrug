import { db } from './api.js';
export class MediaError extends Error { constructor(message){super(message);this.name='MediaError';} }
const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','audio/mpeg':'mp3','audio/mp4':'m4a','audio/ogg':'ogg','audio/wav':'wav','audio/x-wav':'wav'};
export function validateFiles(files,avatar=false){
  if(files.length>(avatar?1:6))throw new MediaError(avatar?'Выберите одно фото.':'Можно прикрепить до 6 файлов.');
  for(const file of files){
    const image=file.type.startsWith('image/');
    if(!types[file.type] || (avatar&&!image))throw new MediaError('Поддерживаются JPG, PNG, WebP и музыка MP3, M4A, OGG, WAV.');
    const limit=avatar?5:image?8:20;
    if(!file.size || file.size>limit*1024*1024)throw new MediaError(`Файл «${file.name}»: допустимый размер — до ${limit} МБ.`);
  }
}
export async function uploadFiles(files,userId,avatar=false){
  validateFiles(files,avatar);
  const bucket=avatar?'avatars':'idea-media',uploaded=[];
  try{
    for(const file of files){
      const path=`${userId}/${crypto.randomUUID()}.${types[file.type]}`;
      const {error}=await db.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
      if(error)throw error;
      uploaded.push({path,name:file.name.slice(0,200),kind:file.type.startsWith('image/')?'image':'audio'});
    }
    return uploaded;
  }catch(error){await removeFiles(bucket,uploaded.map(f=>f.path));throw error;}
}
export async function removeFiles(bucket,paths){
  if(!paths.length)return;
  try{const {error}=await db.storage.from(bucket).remove(paths);if(error)console.warn('Не удалось удалить неиспользуемые файлы.');}catch{console.warn('Не удалось удалить неиспользуемые файлы.');}
}
export function photoUrl(record){return record?.avatar_path?db.storage.from('avatars').getPublicUrl(record.avatar_path).data.publicUrl:record?.avatar_url;}
export async function attachmentUrls(ideas){
  const paths=[...new Set(ideas.flatMap(i=>(i.attachments||[]).map(a=>a.path)))];
  if(!paths.length)return new Map();
  const {data,error}=await db.storage.from('idea-media').createSignedUrls(paths,3600);
  if(error)return new Map();
  return new Map(data.filter(item=>item.signedUrl).map(item=>[item.path,item.signedUrl]));
}
