'use strict';
/* Tùng Lâm Automation · Dell Remote Power / zero-framework UI.
 * MQTT.js is a locally vendored client; no broker secret is embedded here.
 */
(()=>{
const $=id=>document.getElementById(id);
const STORE='dell7560-cloud-config-v1';
const TEMP_SECRET='dell7560-mqtt-session';
const THEME='tunglam-dell-theme-v2';
const PRESENCE_ID='FFFFFFFFFFFFFFFF';
const BROKER_HOST='j1199ec9.ala.asia-southeast1.emqxsl.com';
const SCHEDULE_MIN=120;
const SCHEDULE_MAX=24*3600;
const ACK_WAIT_MS=13000;
let mqttClient=null,connected=false,espOnline=false,agentOnline=false;
let timerSupported=false,shutdownDeadline=null,shutdownKind=null;
let pending=null,prefix='home/dell7560',delayMinutes=15;
let eventCounter=0,lastStateAt=0,lastAgentHeartbeatAt=0;

const fmtTime=()=>new Date().toLocaleTimeString('vi-VN',{hour12:false});
function log(level,description){
 const line=document.createElement('div');line.className='log-entry';
 const time=document.createElement('time');time.textContent=fmtTime();
 const tag=document.createElement('span');tag.className='log-'+level;
 tag.textContent='['+({success:'OK',error:'ERR',warn:'WARN',info:'INFO'}[level]||'INFO')+']';
 const content=document.createElement('span');content.textContent=description;
 line.append(time,tag,content);
 const history=$('log');if(++eventCounter===1)history.replaceChildren();
 history.append(line);while(history.children.length>90)history.firstElementChild.remove();
 history.scrollTop=history.scrollHeight;
 $('message').textContent=description;
}
function setLed(id,state){$(id).className='led '+(state||'');}
function refreshOverview(){
 const head=$('deviceHeadline'),sub=$('deviceSummary'),badge=$('deviceBadge'),light=$('deviceLight');
 let mode='unknown',title='Chưa xác minh được trạng thái Dell',detail='Chưa có dữ liệu mới từ hệ thống.';
 if(!connected){mode='offline';title='Cloud chưa kết nối';detail='Kiểm tra mạng hoặc kết nối lại EMQX để điều khiển từ xa.'}
 else if(agentOnline){mode='online';title='Dell đang hoạt động';detail='Windows Agent đã kết nối, có thể tắt hoặc đặt lịch tắt từ xa.'}
 else if(espOnline){mode='standby';title='Dell chưa phản hồi';detail='ESP32 đang trực tuyến. Có thể gửi lệnh đánh thức qua Wake-on-LAN.'}
 else{mode='offline';title='Đang chờ tín hiệu thiết bị';detail='Cloud đã kết nối nhưng chưa xác nhận được trạng thái ESP32 hoặc Dell.'}
 head.textContent=title;sub.textContent=detail;
 badge.className='overview-tag mode-'+mode;
 badge.textContent={online:'ĐANG HOẠT ĐỘNG',standby:'SẴN SÀNG ĐÁNH THỨC',offline:'CHƯA KẾT NỐI',unknown:'CHƯA RÕ'}[mode];
 light.className='emblem-led mode-'+mode;
 $('pingAgent').disabled=!connected||Boolean(pending);
 if(!connected||!lastStateAt){$('lastSync').textContent='Chưa nhận dữ liệu trạng thái';return}
 const elapsed=Math.max(0,Math.floor((Date.now()-lastStateAt)/1000));
 $('lastSync').textContent=elapsed<15?'Vừa cập nhật':elapsed<60?'Cập nhật '+elapsed+' giây trước':
  'Cập nhật '+Math.floor(elapsed/60)+' phút trước';
}
function refreshSchedulePreview(){
 const box=$('schedulePreview');
 try{
  const target=chosenTarget();
  box.classList.remove('preview-error');
  box.textContent='Dự kiến tắt lúc '+new Date(target*1000).toLocaleString('vi-VN')+
    ' · Chỉ đặt lịch khi anh nhấn xác nhận.';
 }catch(e){
  box.classList.add('preview-error');box.textContent=e.message;
 }
}
function updateState(){
 $('cloudState').textContent=connected?'ONLINE':'OFFLINE';
 $('cloudTop').textContent=connected?'Cloud Connected':'Cloud Disconnected';
 $('sidebarCloud').textContent=connected?'CONNECTED':'DISCONNECTED';
 ['cloudDot','sideDot'].forEach(id=>setLed(id,connected?'ok':'bad'));
 $('cloudPill').querySelector('.led').className='led '+(connected?'ok':'bad');
 $('espState').textContent=espOnline?'ONLINE':'OFFLINE';setLed('espDot',espOnline?'ok':'bad');
 $('pcState').textContent=agentOnline?'ONLINE':'OFFLINE';setLed('pcDot',agentOnline?'ok':'bad');
 $('wake').disabled=!(connected&&espOnline)||Boolean(pending);
 $('shutdown').disabled=!(connected&&agentOnline)||Boolean(pending)||Boolean(shutdownDeadline);
 $('scheduleBtn').disabled=!(connected&&agentOnline&&timerSupported)||Boolean(pending)||Boolean(shutdownDeadline);
 $('cancel').disabled=!(connected&&agentOnline)||Boolean(pending);
 $('cancelSchedule').disabled=!(connected&&agentOnline)||Boolean(pending);
 $('cancel').hidden=!shutdownDeadline;
 $('cancelStrip').hidden=!shutdownDeadline;
 $('cancelSchedule').hidden=!shutdownDeadline;
 refreshOverview();
}
function setScheduleDeadline(value,kind){
 const target=Number(value);
 shutdownDeadline=Number.isFinite(target)&&target>Math.floor(Date.now()/1000)?target:null;
 shutdownKind=shutdownDeadline?(kind||'timer'):null;
 renderCountdown();updateState();
}
function renderCountdown(){
 const sec=shutdownDeadline?Math.max(0,shutdownDeadline-Math.floor(Date.now()/1000)):0;
 if(shutdownDeadline&&sec>0){
   const hh=String(Math.floor(sec/3600)).padStart(2,'0');
   const mm=String(Math.floor((sec%3600)/60)).padStart(2,'0');
   const ss=String(sec%60).padStart(2,'0');
   $('countdown').textContent=hh+' : '+mm+' : '+ss;
   $('timerState').textContent='ĐANG HẸN';setLed('timerDot','warn');
   $('timerSummary').textContent=shutdownKind==='now'?'Sắp tắt (45 giây)':'Đã lên lịch';
   $('timerDisplayLabel').textContent='THỜI GIAN CÒN LẠI';
   $('scheduleWhen').textContent='Dự kiến tắt: '+new Date(shutdownDeadline*1000).toLocaleString('vi-VN');
 } else if(shutdownDeadline){
   $('countdown').textContent='00 : 00 : 00';
   $('timerDisplayLabel').textContent='ĐÃ ĐẾN GIỜ TẮT';
   $('timerState').textContent='ĐẾN GIỜ';setLed('timerDot','warn');
   $('timerSummary').textContent='Chờ Windows tắt máy';
 } else {
   $('countdown').textContent='-- : -- : --';
   $('timerDisplayLabel').textContent='TRẠNG THÁI LỊCH TẮT';
   $('scheduleWhen').textContent='Chưa có lịch tắt máy';
   $('timerState').textContent='CHƯA ĐẶT';setLed('timerDot','');
   $('timerSummary').textContent='Không có lịch đang chạy';
 }
}
function applyPresence(packet){
 lastStateAt=Date.now();
 lastAgentHeartbeatAt=packet.result==='power_agent_online'?Date.now():0;
 const wasOnline=agentOnline,wasTimerSupported=timerSupported;
 const wasDeadline=shutdownDeadline,wasKind=shutdownKind;
 agentOnline=packet.result==='power_agent_online';
 timerSupported=agentOnline&&(packet.capabilities?.includes?.('schedule_v2')===true);
 const target=packet.scheduled_for;
 if(agentOnline&&Number.isInteger(target)&&target>0){
   setScheduleDeadline(target,packet.scheduled_kind);
 }else if(packet.result==='power_agent_online'&&('scheduled_for' in packet)){
   setScheduleDeadline(null,null);
 }
 updateState();
 // The Windows agent refreshes retained presence every 20 seconds.
 // Only log changes, not identical heartbeats that would flood mobile history.
 if(wasOnline!==agentOnline||wasTimerSupported!==timerSupported||
    wasDeadline!==shutdownDeadline||wasKind!==shutdownKind){
   log('info',agentOnline?'Windows agent đã kết nối'+
     (timerSupported?' · hỗ trợ hẹn giờ':' · bản cũ, chưa hỗ trợ lịch mới'):
     'Windows agent đang offline');
 }
}
function randomHex(bytes=8){const b=new Uint8Array(bytes);crypto.getRandomValues(b);return Array.from(b,v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();}
function setAdvanced(visible){
 const section=$('advancedSettings');
 section.hidden=!visible;
 $('advancedToggle').setAttribute('aria-expanded',visible?'true':'false');
 $('advancedToggleLabel').textContent=visible?'Ẩn cấu hình nâng cao':'Settings · Cấu hình nâng cao';
}
function openSettings(advanced=false){
 setAdvanced(advanced);
 const dialog=$('settings');
 if(!dialog.open)dialog.showModal();
}
function getInput(){
 const host=$('host').value.trim().replace(/^wss:\/\//i,'').replace(/:8084(\/mqtt)?\/?$/i,'').replace(/\/mqtt\/?$/i,'');
 const user=$('user').value.trim(),password=$('pass').value,topic=$('topic').value.trim().replace(/\/$/,'');
 if(!/^[A-Za-z0-9][A-Za-z0-9.-]{2,250}$/.test(host)||host.includes('..'))throw Error('Broker hostname không hợp lệ');
 if(!password)throw Error('Vui lòng nhập mật khẩu MQTT');
 if(!user)throw Error('Thiếu MQTT username trong Settings');
 if(!/^[A-Za-z0-9_/-]{3,100}$/.test(topic))throw Error('Topic prefix không hợp lệ');
 return {host,user,password,topic};
}
function saveConfig(c){
 localStorage.setItem(STORE,JSON.stringify({...c,password:$('remember').checked?c.password:''}));
 if($('remember').checked)sessionStorage.removeItem(TEMP_SECRET);
 else sessionStorage.setItem(TEMP_SECRET,c.password);
}
function loadConfig(){
 try{
  const saved=JSON.parse(localStorage.getItem(STORE)||'{}');
  $('host').value=saved.host||BROKER_HOST;$('user').value=saved.user||'Dell-Phone';
  $('topic').value=saved.topic||'home/dell7560';
  $('pass').value=saved.password||sessionStorage.getItem(TEMP_SECRET)||'';
  $('remember').checked=!!saved.password;
  return !!$('pass').value;
 }catch{return false}
}
function connect(){
 let cfg;try{cfg=getInput()}catch(e){log('error',e.message);openSettings(!e.message.includes('mật khẩu'));return}
 if(typeof mqtt==='undefined'){log('error','Thiếu thư viện MQTT.js');return}
 saveConfig(cfg);if(mqttClient){try{mqttClient.end(true)}catch{}}
 connected=false;espOnline=false;agentOnline=false;timerSupported=false;
 pending=null;prefix=cfg.topic;updateState();
 log('info','Đang kết nối EMQX Cloud qua WSS/TLS...');
 const c=mqtt.connect('wss://'+cfg.host+':8084/mqtt',{
   clientId:'tlam_phone_'+randomHex().toLowerCase(),username:cfg.user,password:cfg.password,
   protocolVersion:5,clean:true,connectTimeout:12000,reconnectPeriod:3500,
   keepalive:30,queueQoSZero:false,resubscribe:false
 });
 mqttClient=c;
 c.on('connect',()=>{
   if(c!==mqttClient)return;
   connected=true;espOnline=false;agentOnline=false;timerSupported=false;
   updateState();log('success','Đã kết nối EMQX Cloud');
   c.subscribe([prefix+'/status',prefix+'/ack'],{qos:1},(err,grants)=>{
     if(err||!grants?.every(x=>x.qos<128))log('error','Broker từ chối đăng ký topic');
     else log('info','Đang nhận trạng thái ESP32 và Dell...');
   });
 });
 c.on('message',(topic,data)=>{
   if(c!==mqttClient)return;
   const value=data.toString();
   if(topic===prefix+'/status'){
     lastStateAt=Date.now();
     const online=value==='online';if(online!==espOnline){espOnline=online;updateState();log(online?'success':'warn','ESP32 '+(online?'đang trực tuyến':'đã ngoại tuyến'));}
     return;
   }
   if(topic!==prefix+'/ack')return;
   let a;try{a=JSON.parse(value)}catch{return}
   if(a.id===PRESENCE_ID){applyPresence(a);return}
   if(!pending||pending.id!==a.id)return;
   const action=pending.action;
   const latency=Math.max(0,Date.now()-(pending.sentAt||Date.now()));
   pending=null;
   lastStateAt=Date.now();
   if(action==='WAKE')log(a.result==='wol_sent'?'success':'warn',a.result==='wol_sent'?'ESP32 đã gửi Magic Packet. Hãy chờ Dell khởi động.':'Wake: '+a.result);
   else if(action==='SHUTDOWN'||action==='SCHEDULE'){
     if(['shutdown_scheduled','timer_scheduled','shutdown_already_scheduled'].includes(a.result)){
       if(Number.isInteger(a.scheduled_for))setScheduleDeadline(a.scheduled_for,action==='SHUTDOWN'?'now':'timer');
       log('success','Windows đã nhận lịch tắt'+(shutdownDeadline?' lúc '+new Date(shutdownDeadline*1000).toLocaleString('vi-VN'):''));
     }else log('error','Không lên lịch được: '+a.result);
   }else if(action==='CANCEL'){
     if(a.result==='shutdown_cancelled'){setScheduleDeadline(null,null);log('success','Đã hủy lịch tắt trên Windows');}
     else log('warn','Hủy lịch: '+a.result);
   }else if(action==='PING'){
     if(a.result==='power_agent_online'){applyPresence(a);
       log('success','Dell phản hồi trong '+latency+' ms · Windows Agent ONLINE');
     }else log('warn','Kiểm tra Dell: '+a.result);
   }
   updateState();
 });
 c.on('reconnect',()=>{if(c!==mqttClient)return;connected=false;espOnline=false;agentOnline=false;timerSupported=false;updateState();log('warn','Đang kết nối lại Cloud...');});
 c.on('close',()=>{if(c!==mqttClient)return;connected=false;espOnline=false;agentOnline=false;timerSupported=false;updateState();});
 c.on('error',e=>{if(c===mqttClient)log('error','MQTT/TLS: '+String(e.code||e.message).slice(0,100))});
 $('settings').close();
}
function command(action,target){
 if(!mqttClient||!connected||pending)return false;
 if(action==='WAKE'&&!espOnline)return false;
 if(['SHUTDOWN','CANCEL','SCHEDULE'].includes(action)&&!agentOnline)return false;
 if(action==='SCHEDULE'&&!timerSupported)return false;
 const now=Math.floor(Date.now()/1000),expiry=now+30,id=randomHex();
 const extra=action==='SCHEDULE'?'|'+target:'';
 pending={id,action,sentAt:Date.now()};updateState();
 mqttClient.publish(prefix+'/cmd',action+'|'+expiry+'|'+id+extra,{qos:1,retain:false},err=>{
   if(err&&pending?.id===id){pending=null;updateState();log('error','Gửi lệnh lỗi: '+err.message);}
   else log('info','Đã gửi '+action+' đến EMQX, đang chờ thiết bị xác nhận...');
 });
 setTimeout(()=>{if(pending?.id===id){pending=null;updateState();log('warn','Hết thời gian chờ xác nhận. Kiểm tra trạng thái thiết bị.');}},ACK_WAIT_MS);
 return true;
}
function ask(title,content,onYes){
 $('confirmTitle').textContent=title;$('confirmText').textContent=content;
 const dialog=$('confirmDialog');
 dialog.showModal();
 dialog.addEventListener('close',()=>{if(dialog.returnValue==='confirm')onYes()}, {once:true});
}
function shutdownNow(){
 ask('Xác nhận tắt Dell','Windows sẽ bắt đầu tắt sau 45 giây. Hãy lưu tài liệu đang mở; có thể hủy lịch trước thời hạn.',()=>command('SHUTDOWN'));
}
function chosenTarget(){
 const now=Math.floor(Date.now()/1000);
 let target;
 if($('timeMode').value==='datetime'){
   const date=new Date($('shutdownAt').value);
   target=Math.floor(date.getTime()/1000);
 } else target=now+delayMinutes*60;
 if(!Number.isSafeInteger(target)||target<now+SCHEDULE_MIN||target>now+SCHEDULE_MAX)throw Error('Hẹn giờ phải nằm trong khoảng 2 phút đến 24 giờ tính từ hiện tại');
 return target;
}
function schedulePower(){
 let target;try{target=chosenTarget()}catch(e){log('error',e.message);return}
 const description=new Date(target*1000).toLocaleString('vi-VN');
 ask('Xác nhận hẹn giờ tắt','Dell sẽ tắt lúc '+description+'. Lịch được lưu trên Dell và vẫn chạy khi đóng trang web. Anh có thể hủy trước giờ tắt.',()=>command('SCHEDULE',target));
}
function cancelPower(){ask('Hủy lịch tắt?','Xóa lịch tắt đang chờ trên Dell. Máy sẽ tiếp tục hoạt động.',()=>command('CANCEL'));}
function themeApply(v){document.documentElement.dataset.theme=v;localStorage.setItem(THEME,v);document.querySelector('meta[name="theme-color"]').content=v==='light'?'#f4f7fb':'#0d1525';}
function themeToggle(){themeApply(document.documentElement.dataset.theme==='light'?'dark':'light')}
function init(){
  const theme=localStorage.getItem(THEME);themeApply(theme==='light'?'light':'dark');
  $('themeToggle').addEventListener('click',themeToggle);$('themeMobile').addEventListener('click',themeToggle);
  $('configOpen').addEventListener('click',()=>openSettings(true));
  $('settingsShortcut').addEventListener('click',()=>openSettings(true));
  $('advancedToggle').addEventListener('click',()=>setAdvanced($('advancedSettings').hidden));
  $('pass').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();connect()} });
  $('configClose').addEventListener('click',()=>$('settings').close());
  $('connect').addEventListener('click',connect);
  $('reconnect').addEventListener('click',()=>{if($('pass').value)connect();else openSettings(false)});
  $('wake').addEventListener('click',()=>command('WAKE'));
  $('pingAgent').addEventListener('click',()=>{if(!command('PING'))log('warn','Không thể kiểm tra lúc này, hãy chờ lệnh đang xử lý.');});
  $('copyLog').addEventListener('click',async()=>{
    const data=Array.from($('log').querySelectorAll('.log-entry')).map(el=>el.innerText.trim()).join('\n');
    try{await navigator.clipboard.writeText(data);log('success','Đã sao chép nhật ký vào bộ nhớ tạm.')}
    catch(e){log('warn','Không sao chép tự động được; vui lòng chọn và sao chép nhật ký thủ công.')}
  });
  $('shutdown').addEventListener('click',shutdownNow);
  $('scheduleBtn').addEventListener('click',schedulePower);
  $('cancel').addEventListener('click',cancelPower);
  $('cancelSchedule').addEventListener('click',cancelPower);
  $('clearLog').addEventListener('click',()=>{eventCounter=0;$('log').replaceChildren();log('info','Nhật ký giao diện đã xóa');});
  document.querySelectorAll('.preset').forEach(btn=>btn.addEventListener('click',()=>{
    delayMinutes=Number(btn.dataset.minutes);
    document.querySelectorAll('.preset').forEach(b=>b.classList.toggle('active',b===btn));
    $('timeMode').value='delay';$('dateGroup').hidden=true;refreshSchedulePreview();
  }));
  $('timeMode').addEventListener('change',()=>{$('dateGroup').hidden=$('timeMode').value!=='datetime';refreshSchedulePreview();});
  $('shutdownAt').addEventListener('change',refreshSchedulePreview);
  $('shutdownAt').addEventListener('input',refreshSchedulePreview);
  document.querySelectorAll('.dock-item').forEach(a=>a.addEventListener('click',()=>{
    document.querySelectorAll('.dock-item').forEach(x=>x.classList.toggle('active',x===a));
  }));
  const sections=['dashboard','power','schedule','events'].map(id=>$(id));
  if('IntersectionObserver' in window){
    const obs=new IntersectionObserver(entries=>{
      const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(visible)document.querySelectorAll('.dock-item').forEach(a=>
        a.classList.toggle('active',a.getAttribute('href')==='#'+visible.target.id));
    },{rootMargin:'-20% 0px -50% 0px',threshold:[0,.15,.4]});
    sections.forEach(s=>obs.observe(s));
  }
  setInterval(()=>{
    if(agentOnline&&lastAgentHeartbeatAt&&Date.now()-lastAgentHeartbeatAt>75000){
      agentOnline=false;timerSupported=false;lastAgentHeartbeatAt=0;
      log('warn','Không nhận heartbeat Windows Agent trong 75 giây.');
      updateState();
    }
    refreshOverview();
  },5000);
  setInterval(renderCountdown,1000);
  renderCountdown();updateState();refreshSchedulePreview();
  if(loadConfig())connect();else openSettings(false);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();