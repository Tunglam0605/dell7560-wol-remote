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
let timerSupported=false,lockSupported=false,shutdownDeadline=null,shutdownKind=null;
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

let monitorSnapshot=null;
function metricNumber(x,min=0,max=100){
 return typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;
}
function captureMonitor(v){
 if(!v||typeof v!=='object')return;
 const ts=metricNumber(v.ts,1600000000,4102444800);
 if(ts===null||Math.abs(Date.now()/1000-ts)>150)return;
 monitorSnapshot={
  ts,
  cpu_pct:metricNumber(v.cpu_pct),
  ram_used_pct:metricNumber(v.ram_used_pct),
  ram_used_gb:metricNumber(v.ram_used_gb,0,1024),
  ram_total_gb:metricNumber(v.ram_total_gb,0,1024),
  uptime_sec:metricNumber(v.uptime_sec,0,315360000),
  battery_pct:metricNumber(v.battery_pct),
  ac_online:typeof v.ac_online==='boolean'?v.ac_online:null,
  charging:typeof v.charging==='boolean'?v.charging:null,
  ethernet_link:typeof v.ethernet_link==='boolean'?v.ethernet_link:null,
  ethernet_mbps:metricNumber(v.ethernet_mbps,0,1000000)
 };
 renderMonitor();
}
function formatUptime(sec){
 if(sec===null)return '--';
 const d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60);
 return d?d+' ngày '+h+' giờ':h?h+' giờ '+m+' phút':m+' phút';
}
function renderMonitor(){
 const data=monitorSnapshot;
 const fresh=connected&&agentOnline&&data&&Date.now()/1000-data.ts<85;
 const formatPct=x=>x===null?'--':Math.round(x)+'%';
 const set=(id,val)=>{$(id).textContent=val};
 const bar=(id,val)=>{$(id).style.width=fresh&&val!==null?Math.round(val)+'%':'0%'};
 set('monCpu',fresh?formatPct(data.cpu_pct):'--');bar('monCpuGauge',fresh?data.cpu_pct:null);
 set('monRam',fresh?formatPct(data.ram_used_pct):'--');bar('monRamGauge',fresh?data.ram_used_pct:null);
 set('monRamDetail',fresh&&data.ram_used_gb!==null&&data.ram_total_gb!==null?
   data.ram_used_gb.toFixed(1)+' / '+data.ram_total_gb.toFixed(1)+' GB':'Đang chờ dữ liệu');
 set('monBattery',fresh?formatPct(data.battery_pct):'--');bar('monBatteryGauge',fresh?data.battery_pct:null);
 let supply='Đang chờ dữ liệu';
 if(fresh){
  if(data.ac_online===true)supply=data.charging===true?'Đang sạc · nguồn AC':'Đang cắm nguồn AC';
  else if(data.ac_online===false)supply='Đang sử dụng pin';
  else supply='Không đọc được trạng thái nguồn';
 }
 set('monPowerDetail',supply);
 const link=fresh?data.ethernet_link:null;
 set('monEthernet',link===true?'CONNECTED':link===false?'OFFLINE':'--');
 set('monEthernetDetail',link===true&&data.ethernet_mbps!==null?
   data.ethernet_mbps>=1000?(data.ethernet_mbps/1000).toFixed(data.ethernet_mbps%1000===0?0:1)+' Gbps':
   data.ethernet_mbps+' Mbps':link===false?'Không có liên kết LAN':'Đang chờ dữ liệu');
 $('monNetDot').className='led '+(link===true?'ok':link===false?'bad':'');
 set('monUptime',fresh?formatUptime(data.uptime_sec):'--');
 $('monUptimeDot').className='led '+(fresh?'ok':'');
 set('monCpuDetail',fresh&&data.cpu_pct!==null?'Mức sử dụng bộ xử lý':'Đang chờ dữ liệu');
 const badge=$('monitorBadge');
 badge.className='monitor-live-badge '+(fresh?'mon-live':'mon-wait');
 badge.textContent=fresh?'ĐANG CẬP NHẬT':'CHỜ DỮ LIỆU';
 const elapsed=data?Math.round(Date.now()/1000-data.ts):null;
 set('monitorUpdated',fresh?(elapsed<=10?'Vừa cập nhật':'Cập nhật '+elapsed+' giây trước'):
  (data?'Chỉ số cũ đã được ẩn':'Chưa nhận thông số'));
}



const BUZZER_STATUS_ID='BBBBBBBBBBBBBBBB';
const MELODY_LABELS=['Bíp ngắn','Ba tiếng bíp nhanh','Hai tiếng bíp dài','Bốn tiếng bíp'];
const DAY_NAMES=['T2','T3','T4','T5','T6','T7','CN'];
let buzzerState=null,buzzerUpdated=0,alarmEditingSlot=null;
function buzzerReady(){return connected&&espOnline&&buzzerState?.version===2&&Date.now()-buzzerUpdated<50000}
const alarmTimeText=a=>String(a.hour).padStart(2,'0')+':'+String(a.minute).padStart(2,'0');
function alarmDaysText(days){
 if(days===0)return 'Một lần';
 if(days===127)return 'Hằng ngày';
 if(days===31)return 'Thứ 2 – Thứ 6';
 if(days===96)return 'Thứ 7, Chủ nhật';
 return DAY_NAMES.filter((_,i)=>days&(1<<i)).join(', ');
}
function applyBuzzerSignal(v){
 if(v.result!=='buzzer_status'||v.buzzer_enabled!==true||!Number.isInteger(v.ts)||
    Math.abs(Date.now()/1000-v.ts)>60)return;
 const a=v.alarm;
 if(!a||typeof a.ringing!=='boolean'||typeof a.time_synced!=='boolean'||
    a.zone!=='Asia/Ho_Chi_Minh')return;
 if(a.version!==2){
  buzzerState={version:1,ringing:a.ringing,time_synced:a.time_synced,alarms:[]};
  buzzerUpdated=Date.now();renderBuzzer();return;
 }
 if(!Array.isArray(a.alarms)||a.alarms.length>8)return;
 const ids=new Set();
 for(const e of a.alarms){
  if(!e||!Number.isInteger(e.id)||e.id<0||e.id>7||ids.has(e.id)||
     typeof e.enabled!=='boolean'||!Number.isInteger(e.hour)||e.hour<0||e.hour>23||
     !Number.isInteger(e.minute)||e.minute<0||e.minute>59||
     !Number.isInteger(e.days)||e.days<0||e.days>127||
     !Number.isInteger(e.melody)||e.melody<0||e.melody>3)return;
  ids.add(e.id);
 }
 if(!buzzerState?.ringing&&a.ringing)log('warn','ESP32 đang phát báo thức.');
 buzzerState=a;buzzerUpdated=Date.now();renderBuzzer();
}
function alarmRepeatShow(){
 $('buzzerCustomDays').hidden=$('buzzerRepeat').value!=='custom';
}
function alarmDaysValue(){
 switch($('buzzerRepeat').value){
  case 'daily':return 127;
  case 'weekdays':return 31;
  case 'weekends':return 96;
  case 'once':return 0;
  case 'custom':return Array.from($('buzzerCustomDays').querySelectorAll('input:checked'))
                       .reduce((n,e)=>n+Number(e.value),0);
  default:return -1;
 }
}
function alarmOpenEditor(){
 $('alarmEditor').hidden=false;
 $('alarmEditorToggle').setAttribute('aria-expanded','true');
}
function alarmToggleEditor(){
 if(!$('alarmEditor').hidden){alarmClearEdit();return}
 alarmEditingSlot=null;
 $('alarmEditorTitle').textContent='Thêm báo thức mới';
 $('buzzerSet').textContent='＋ Thêm báo thức';
 $('buzzerCancelEdit').hidden=true;
 alarmOpenEditor();
 $('buzzerTime').focus();
 renderBuzzer();
}
function alarmClearEdit(){
 alarmEditingSlot=null;
 $('alarmEditorTitle').textContent='Thêm báo thức mới';
 $('buzzerSet').textContent='＋ Thêm báo thức';
 $('buzzerCancelEdit').hidden=true;
 $('alarmEditor').hidden=true;
 $('alarmEditorToggle').setAttribute('aria-expanded','false');
 $('buzzerRepeat').value='daily';
 $('buzzerMelody').value='0';
 alarmRepeatShow();
 renderBuzzer();
}
function alarmEdit(slot){
 if(!buzzerReady())return;
 const e=buzzerState.alarms.find(x=>x.id===slot);
 if(!e)return;
 alarmEditingSlot=slot;
 $('buzzerTime').value=alarmTimeText(e);
 $('buzzerMelody').value=String(e.melody);
 $('buzzerRepeat').value=e.days===127?'daily':e.days===31?'weekdays':
                          e.days===96?'weekends':e.days===0?'once':'custom';
 for(const cb of $('buzzerCustomDays').querySelectorAll('input'))
  cb.checked=(e.days&Number(cb.value))!==0;
 alarmRepeatShow();
 $('alarmEditorTitle').textContent='Chỉnh sửa báo thức '+(slot+1);
 $('buzzerSet').textContent='✓ Lưu thay đổi';
 $('buzzerCancelEdit').hidden=false;
 alarmOpenEditor();
 $('buzzerTime').focus();
 renderBuzzer();
}
function alarmListRender(ready){
 const list=$('buzzerAlarmList');
 list.replaceChildren();
 if(!ready){
  const p=document.createElement('p');p.className='hint';
  p.textContent=connected&&espOnline&&buzzerState?.version===1?
    'ESP32 đang chạy firmware cũ. Cần firmware v4.7 để dùng nhiều báo thức.':
    'Đang chờ dữ liệu lịch báo thức từ ESP32.';
  list.append(p);return;
 }
 const items=[...buzzerState.alarms].sort((a,b)=>a.hour*60+a.minute-b.hour*60-b.minute);
 if(!items.length){
  const p=document.createElement('p');p.className='hint';
  p.textContent='Chưa có báo thức. Nhấn “Thêm báo thức mới” để tạo lịch.';list.append(p);
 }
 for(const e of items){
  const card=document.createElement('div');card.className='alarm-item'+(e.enabled?'':' alarm-muted');
  const desc=document.createElement('div');desc.className='alarm-item-main';
  const time=document.createElement('strong');time.textContent=alarmTimeText(e);
  const details=document.createElement('small');
  details.textContent=alarmDaysText(e.days)+' · '+MELODY_LABELS[e.melody];
  desc.append(time,details);
  const actions=document.createElement('div');actions.className='alarm-item-actions';
  const make=(label,fn,cls)=>{const btn=document.createElement('button');
   btn.type='button';btn.className='btn btn-sm '+cls;btn.textContent=label;
   btn.disabled=!!pending;btn.addEventListener('click',fn);return btn;};
  actions.append(
   make(e.enabled?'Đang bật':'Đã tắt',()=>command('ALARM_ENABLE',String(e.id)+(e.enabled?'0':'1')),e.enabled?'alarm-on':'alarm-off'),
   make('Sửa',()=>alarmEdit(e.id),'btn-outline'),
   make('Xóa',()=>ask('Xóa báo thức?','Xóa '+alarmTimeText(e)+' khỏi ESP32?',()=>command('ALARM_DELETE',String(e.id))),'btn-ghost')
  );
  card.append(desc,actions);list.append(card);
 }
}
function renderBuzzer(){
 const ready=!!buzzerReady(),a=ready?buzzerState:null;
 const badge=$('buzzerCloudState');
 badge.className='buzzer-ready '+(ready?'ready':connected&&espOnline?'bad':'');
 badge.textContent=ready?'CÒI ONLINE':connected&&espOnline&&buzzerState?.version===1?
  'CẦN V4.7':connected&&espOnline?'CHỜ FIRMWARE':'CHƯA KẾT NỐI';
 $('buzzerActivity').textContent=!a?'Chưa xác nhận':a.ringing?'ĐANG BÁO THỨC':'Sẵn sàng';
 $('buzzerAlarmTime').textContent=!a?'--':a.alarms.filter(e=>e.enabled).length+' / 8';
 $('buzzerClockSync').textContent=!a?'--':a.time_synced?'Đã đồng bộ':'Chờ đồng bộ';
 $('alarmSlotsLeft').textContent=!a?'Chưa có dữ liệu':(8-a.alarms.length)+' vị trí còn trống';
 $('buzzerTest').disabled=!ready||!!pending;
 $('buzzerSet').disabled=!ready||!a.time_synced||!!pending||
   (alarmEditingSlot===null&&a.alarms.length>=8);
 $('buzzerStop').disabled=!ready||!!pending;
 $('buzzerRefresh').disabled=!connected||!espOnline||!!pending;
 alarmListRender(ready);
 if(!ready)$('buzzerFeedback').textContent=connected&&espOnline?
  'Đang chờ trạng thái v4.7 từ ESP32.':'Cần kết nối EMQX và ESP32.';
}
function buzzerAction(action){
 if(action!=='ALARM_STATUS'&&!buzzerReady()){log('warn','ESP32 chưa xác nhận firmware báo thức v4.7');return}
 if(action==='ALARM_PUT'){
  const time=$('buzzerTime').value,dayMask=alarmDaysValue();
  if(!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)){
   log('warn','Giờ báo thức không hợp lệ');return;
  }
  if(dayMask<0||(dayMask===0&&$('buzzerRepeat').value==='custom')){
   log('warn','Hãy chọn ít nhất một ngày lặp');return;
  }
  let slot=alarmEditingSlot;
  if(slot===null){
   const used=new Set(buzzerState.alarms.map(x=>x.id));
   slot=Array.from({length:8},(_,i)=>i).find(i=>!used.has(i));
  }
  if(slot===undefined){log('warn','Đã đủ 8 báo thức');return}
  const melody=Number($('buzzerMelody').value);
  const payload=String(slot)+time.replace(':','')+dayMask.toString(16).padStart(2,'0').toUpperCase()+String(melody);
  command('ALARM_PUT',payload);
  return;
 }
 if(action==='MELODY_TEST'){
  command('MELODY_TEST',$('buzzerPreviewMelody').value);return;
 }
 command(action);
}
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
 renderBuzzer();
 $('shutdown').disabled=!(connected&&agentOnline)||Boolean(pending)||Boolean(shutdownDeadline);
 $('lockScreen').disabled=!(connected&&agentOnline&&lockSupported)||Boolean(pending);
 $('scheduleBtn').disabled=!(connected&&agentOnline&&timerSupported)||Boolean(pending)||Boolean(shutdownDeadline);
 $('cancel').disabled=!(connected&&agentOnline)||Boolean(pending);
 $('cancelSchedule').disabled=!(connected&&agentOnline)||Boolean(pending);
 $('cancel').hidden=!shutdownDeadline;
 $('cancelStrip').hidden=!shutdownDeadline;
 $('cancelSchedule').hidden=!shutdownDeadline;
 refreshOverview();
 renderMonitor();
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
 if(packet.result==='power_agent_online'&&packet.telemetry)captureMonitor(packet.telemetry);
 const wasOnline=agentOnline,wasTimerSupported=timerSupported;
 const wasDeadline=shutdownDeadline,wasKind=shutdownKind;
 agentOnline=packet.result==='power_agent_online';
 timerSupported=agentOnline&&(packet.capabilities?.includes?.('schedule_v2')===true);
 lockSupported=agentOnline&&(packet.capabilities?.includes?.('lock_v1')===true);
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
 connected=false;espOnline=false;agentOnline=false;timerSupported=false;lockSupported=false;
 buzzerState=null;buzzerUpdated=0;renderBuzzer();
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
   if(a.id===BUZZER_STATUS_ID){applyBuzzerSignal(a);return}
   if(!pending||pending.id!==a.id)return;
   const action=pending.action;
   const latency=Math.max(0,Date.now()-(pending.sentAt||Date.now()));
   pending=null;
   lastStateAt=Date.now();
   if(action==='WAKE')log(a.result==='wol_sent'?'success':'warn',a.result==='wol_sent'?'ESP32 đã gửi Magic Packet. Hãy chờ Dell khởi động.':'Wake: '+a.result);
   else if(['BEEP','ALARM_SET','ALARM_OFF','ALARM_STOP','ALARM_STATUS',
            'ALARM_PUT','ALARM_ENABLE','ALARM_DELETE','MELODY_TEST'].includes(action)){
     const success=['beep_queued','melody_queued','alarm_saved','alarm_deleted',
                    'alarm_disabled','alarm_stopped','alarm_status_ok'].includes(a.result);
     const messages={beep_queued:'ESP32 đã xếp lệnh bíp',melody_queued:'Đã gửi lệnh thử nhịp còi D4',
      alarm_saved:'ESP32 đã lưu báo thức',alarm_deleted:'ESP32 đã xóa báo thức',
      alarm_disabled:'ESP32 đã tắt lịch báo thức',alarm_stopped:'Đã gửi lệnh dừng còi',
      alarm_status_ok:'Đã yêu cầu đồng bộ trạng thái còi'};
     const message=messages[a.result]||'Điều khiển còi: '+String(a.result).slice(0,50);
     $('buzzerFeedback').textContent=message;
     $('buzzerFeedback').className='buzzer-feedback'+(success?'':' err');
     log(success?'success':'warn',message);
     if(action==='ALARM_PUT'&&success)alarmClearEdit();
   }
   else if(action==='LOCK'){
     if(a.result==='lock_dispatched')
       log('success','Windows đã nhận yêu cầu khóa màn hình. Mở lại qua công cụ điều khiển từ xa bằng xác thực Windows.');
     else log('warn','Không gửi được yêu cầu khóa màn hình: '+String(a.result).slice(0,65));
   }
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
 c.on('reconnect',()=>{if(c!==mqttClient)return;connected=false;espOnline=false;agentOnline=false;timerSupported=false;lockSupported=false;updateState();log('warn','Đang kết nối lại Cloud...');});
 c.on('close',()=>{if(c!==mqttClient)return;connected=false;espOnline=false;agentOnline=false;timerSupported=false;lockSupported=false;updateState();});
 c.on('error',e=>{if(c===mqttClient)log('error','MQTT/TLS: '+String(e.code||e.message).slice(0,100))});
 $('settings').close();
}
function command(action,target){
 if(!mqttClient||!connected||pending)return false;
 if(action==='WAKE'&&!espOnline)return false;
 if(['BEEP','ALARM_SET','ALARM_OFF','ALARM_STOP','ALARM_STATUS',
     'ALARM_PUT','ALARM_ENABLE','ALARM_DELETE','MELODY_TEST'].includes(action)
 &&(!espOnline||(action!=='ALARM_STATUS'&&!buzzerReady())))return false;
 if(['SHUTDOWN','CANCEL','SCHEDULE','LOCK'].includes(action)&&!agentOnline)return false;
 if(action==='LOCK'&&!lockSupported)return false;
 if(action==='SCHEDULE'&&!timerSupported)return false;
 const now=Math.floor(Date.now()/1000),expiry=now+30,id=randomHex();
 const extra=['SCHEDULE','ALARM_SET','ALARM_PUT','ALARM_ENABLE','ALARM_DELETE','MELODY_TEST'].includes(action)?'|'+target:'';
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
function lockScreenNow(){
 ask('Khóa màn hình Dell?','Windows sẽ khóa phiên desktop hiện tại, không tắt máy hay ngắt Windows Agent. Để mở khóa, hãy dùng công cụ điều khiển từ xa và xác thực Windows thông thường.',()=>command('LOCK'));
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
  $('buzzerTest').addEventListener('click',()=>buzzerAction('MELODY_TEST'));
  $('buzzerSet').addEventListener('click',()=>buzzerAction('ALARM_PUT'));
  $('alarmEditorToggle').addEventListener('click',alarmToggleEditor);
  $('buzzerStop').addEventListener('click',()=>buzzerAction('ALARM_STOP'));
  $('buzzerRefresh').addEventListener('click',()=>buzzerAction('ALARM_STATUS'));
  $('buzzerRepeat').addEventListener('change',alarmRepeatShow);
  $('buzzerCancelEdit').addEventListener('click',alarmClearEdit);
  $('pingAgent').addEventListener('click',()=>{if(!command('PING'))log('warn','Không thể kiểm tra lúc này, hãy chờ lệnh đang xử lý.');});
  $('copyLog').addEventListener('click',async()=>{
    const data=Array.from($('log').querySelectorAll('.log-entry')).map(el=>el.innerText.trim()).join('\n');
    try{await navigator.clipboard.writeText(data);log('success','Đã sao chép nhật ký vào bộ nhớ tạm.')}
    catch(e){log('warn','Không sao chép tự động được; vui lòng chọn và sao chép nhật ký thủ công.')}
  });
  $('shutdown').addEventListener('click',shutdownNow);
  $('lockScreen').addEventListener('click',lockScreenNow);
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
  // Client-side routes: keep a single MQTT connection and all DOM controls alive.
  // Hide inactive views without removing handlers, data, or pending commands.
  const routeMeta={
    dashboard:['TỔNG QUAN','BẢNG ĐIỀU KHIỂN','Trạng thái và lối tắt truy cập các chức năng chính.'],
    buzzer:['BÁO THỨC','ĐỒNG HỒ BÁO THỨC','Quản lý 8 lịch trên ESP32 và thử âm báo.'],
    monitor:['GIÁM SÁT','GIÁM SÁT DELL','Thông số hệ thống theo thời gian thực.'],
    power:['ĐIỀU KHIỂN','ĐIỀU KHIỂN NGUỒN','Bật máy qua WOL hoặc yêu cầu tắt an toàn.'],
    schedule:['HẸN GIỜ','LỊCH TẮT MÁY','Đặt lịch độc lập trên Windows Agent.'],
    events:['NHẬT KÝ','NHẬT KÝ SỰ KIỆN','Lịch sử lệnh và phản hồi của thiết bị.']
  };
  const more=$('mobileMoreMenu'),moreButton=$('mobileMoreButton');
  const closeMore=()=>{more.hidden=true;moreButton.setAttribute('aria-expanded','false')};
  function renderRoute(){
    const name=window.location.hash.slice(1);
    const view=Object.prototype.hasOwnProperty.call(routeMeta,name)?name:'dashboard';
    document.querySelectorAll('[data-view]').forEach(node=>{
      node.hidden=node.dataset.view!==view;
    });
    const meta=routeMeta[view];
    $('routeLabel').textContent=meta[0];
    $('tabTitle').textContent=meta[1];
    $('tabDescription').textContent=meta[2];
    $('tabHeader').hidden=view==='dashboard';
    document.title=meta[1]+' | Dell Remote Control';
    document.querySelectorAll('.nav-item,.dock-item[href],.mobile-more-link').forEach(a=>{
      const selected=a.getAttribute('href')==='#'+view;
      a.classList.toggle('active',selected);
      if(selected)a.setAttribute('aria-current','page');
      else a.removeAttribute('aria-current');
    });
    moreButton.classList.toggle('active',view==='events'||view==='monitor');
    closeMore();
    window.scrollTo(0,0);
  }
  moreButton.addEventListener('click',()=>{
    more.hidden=!more.hidden;
    moreButton.setAttribute('aria-expanded',String(!more.hidden));
  });
  document.addEventListener('click',e=>{
    if(!more.hidden&&!e.target.closest('.mobile-dock'))closeMore();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!more.hidden){closeMore();moreButton.focus();}
  });
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{
    if(a.getAttribute('href')===window.location.hash)renderRoute();
  }));
  window.addEventListener('hashchange',renderRoute);
  window.addEventListener('pageshow',e=>{if(e.persisted)renderRoute()});
  renderRoute();
  setInterval(()=>{
    if(agentOnline&&lastAgentHeartbeatAt&&Date.now()-lastAgentHeartbeatAt>75000){
      agentOnline=false;timerSupported=false;lockSupported=false;lastAgentHeartbeatAt=0;
      log('warn','Không nhận heartbeat Windows Agent trong 75 giây.');
      updateState();
    }
    refreshOverview();
    renderMonitor();
    
    renderBuzzer();
  },5000);
  setInterval(renderCountdown,1000);
  renderCountdown();updateState();refreshSchedulePreview();renderMonitor();renderBuzzer();
  if(loadConfig())connect();else openSettings(false);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();