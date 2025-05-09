/* ───── 기본 설정 ───────────────────────────────── */
require('dotenv').config();
const express   = require('express');
const multer    = require('multer');
const cors      = require('cors');
const bodyParser= require('body-parser');
const jwt       = require('jsonwebtoken');
const fs        = require('fs');
const path      = require('path');
const fetch =
  globalThis.fetch || ((...a)=>import('node-fetch').then(({default:f})=>f(...a)));

const app  = express();
const port = 3001;

app.use(cors());
app.use(bodyParser.json({limit:'50mb'}));
app.use(bodyParser.urlencoded({extended:true,limit:'50mb'}));
app.use(express.static(__dirname));                         // 정적 (index.html 등)
app.use('/results', express.static(path.join(__dirname,'results')));
fs.mkdirSync(path.join(__dirname,'results'), {recursive:true});

/* ───── API 키 & JWT ────────────────────────────── */
const ACCESS_KEY = process.env.ACCESS_KEY || 'YOUR_ACCESS_KEY';
const SECRET_KEY = process.env.SECRET_KEY || 'YOUR_SECRET_KEY';
function makeJwt(){
  const now = Math.floor(Date.now()/1000);
  return jwt.sign({iss:ACCESS_KEY,exp:now+1800,nbf:now-5},SECRET_KEY,
                  {algorithm:'HS256'});
}

/* ───── 의류 목록 API ────────────────────────────── */
const IMG_REGEX = /\.(png|jpe?g|webp)$/i;
const CATS = ['top','pants','dress'];               // 폴더 = 카테고리

app.get('/api/clothes',(req,res)=>{
  try{
    const base = path.join(__dirname,'clothes');
    let id=1, list=[];
    CATS.forEach(cat=>{
      const dir = path.join(base,cat);
      if(!fs.existsSync(dir)) return;
      fs.readdirSync(dir).filter(f=>IMG_REGEX.test(f)).forEach(f=>{
        list.push({
          id  : id++,
          cat : cat,
          src : `clothes/${cat}/${f}`,
          name: f.replace(/\.[^.]+$/,'').replace(/[_-]/g,' '),
          price: null
        });
      });
    });
    res.json({items:list});
  }catch(e){
    console.error('clothes API error',e);
    res.status(500).json({msg:'clothes list error'});
  }
});

/* ───── Multer (10 MB 문자열 허용) ───────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits : { fieldSize: 10*1024*1024 }
});

/* ───── in-memory 작업 캐시 ─────────────────────── */
const tasks={};

/* ───── POST /api/generate ─────────────────────── */
app.post('/api/generate',upload.single('image'),async(req,res)=>{
  try{
    if(ACCESS_KEY.startsWith('YOUR_'))
      return res.status(500).json({msg:'ACCESS_KEY 설정'});
    const [clothB64] = JSON.parse(req.body.clothingImages||'[]');
    if(!req.file?.buffer)   return res.status(400).json({msg:'인물 사진'});
    if(!clothB64)           return res.status(400).json({msg:'의류 선택'});

    const body={
      model_name :'kolors-virtual-try-on-v1-5',
      human_image: req.file.buffer.toString('base64'),
      cloth_image: clothB64
    };
    const CREATE = 'https://api.klingai.com/v1/images/kolors-virtual-try-on';
    const raw = await fetch(CREATE,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${makeJwt()}`
      },
      body:JSON.stringify(body)
    });
    const js = await raw.json();
    const taskId = js?.data?.task_id;
    if(!taskId) throw new Error('task_id 없음');

    tasks[taskId]={task_status:'submitted'};
    res.json({code:0,data:{task_id:taskId,task_status:'submitted'}});

    pollTask(taskId).catch(e=>console.error('poll error',e.message));
  }catch(e){
    console.error(e);
    res.status(500).json({msg:e.message});
  }
});

/* ───── GET /api/result/:id ─────────────────────── */
app.get('/api/result/:id',(req,res)=>{
  const d=tasks[req.params.id];
  if(!d) return res.status(404).json({msg:'not found'});
  res.json({task_id:req.params.id,...d});
});

/* ───── 폴링 함수 ───────────────────────────────── */
async function pollTask(id,max=40,interval=8000){
  const QUERY=`https://api.klingai.com/v1/images/kolors-virtual-try-on/${id}`;
  for(let i=0;i<max;i++){
    await new Promise(r=>setTimeout(r,interval));
    const js=await fetch(QUERY,{headers:{Authorization:`Bearer ${makeJwt()}`}}).then(r=>r.json());
    const status=js?.data?.task_status;
    if(!status){console.error(id,'status 없음');continue;}
    tasks[id].task_status=status;
    if(status==='succeed'){
      const url=js.data?.task_result?.images?.[0]?.url;
      if(!url){tasks[id].task_status='failed';return;}
      const buf=await fetch(url).then(r=>r.arrayBuffer());
      fs.writeFileSync(path.join(__dirname,'results',`${id}.png`),Buffer.from(buf));
      tasks[id].local_url=`/results/${id}.png`;
      return;
    }
    if(status==='failed') return;
  }
  tasks[id].task_status='timeout';
}

/* ───── start ───────────────────────────────────── */
app.listen(port,()=>console.log(`🚀 http://localhost:${port}`));
