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


const CSI_STATUS_ID='CCCCCCCCCCCCCCCC';
let roomData=null,lastCsiSeq=-1;
const CSI_TTL_SECONDS=45;
function applyRoomSignal(packet){
 if(packet.result!=='csi_sample')return;
 const ts=Number(packet.ts),seq=Number(packet.seq),samples=Number(packet.samples);
 if(!Number.isInteger(ts)||ts<1600000000||ts>Date.now()/1000+15||Date.now()/1000-ts>CSI_TTL_SECONDS)return;
 if(!Number.isInteger(seq)||seq<0||!Number.isInteger(samples)||samples<0||samples>10000)return;
 if(!['UNKNOWN','CALIBRATING','MOVEMENT_CANDIDATE','QUIET_SIGNAL','MICRO_VARIATION'].includes(packet.state))return;
 // RSSI / scores are diagnostic only; never classify someone as absent.
 if(!Number.isInteger(packet.rssi)||packet.rssi<-130||packet.rssi>20 ||
    !Number.isInteger(packet.score)||packet.score<0||packet.score>100000000)return;
 if(roomData&&seq<lastCsiSeq&&ts<=roomData.ts)return; // old telemetry
 const micro=Number.isInteger(packet.micro_score)&&packet.micro_score>=0&&packet.micro_score<100000000?packet.micro_score:null;
 const rate=Number.isInteger(packet.rate_x10)&&packet.rate_x10>=0&&packet.rate_x10<=2000?packet.rate_x10:null;
 roomData={ts,seq,state:packet.state,samples,rssi:packet.rssi,score:packet.score,micro,rate};
 lastCsiSeq=seq;
 renderRoom();
}
function renderRoom(){
 const recent=connected&&espOnline&&roomData&&Date.now()/1000-roomData.ts<CSI_TTL_SECONDS;
 const state=recent?roomData.state:'UNKNOWN';
 const t={
  MOVEMENT_CANDIDATE:['Có biến động tín hiệu','ESP32 phát hiện biến động CSI đáng chú ý. Có thể do người di chuyển hoặc nhiễu vô tuyến; chưa xác nhận chắc chắn có người.'],
  MICRO_VARIATION:['Phát hiện dao động CSI nhỏ','Tín hiệu trên các sóng mang con đang biến động nhẹ. Đây chưa phải bằng chứng về nhịp thở hoặc người đang nằm ngủ; có thể do nhiễu Wi-Fi.'],
  QUIET_SIGNAL:['Chưa thấy biến động lớn','Tín hiệu tương đối ổn định trong cửa sổ đo. Không đồng nghĩa phòng trống; người ngồi yên vẫn có thể ở trong phòng.'],
  CALIBRATING:['Đang hiệu chuẩn','ESP32 đang thu đường chuẩn Wi-Fi. Giữ nguyên vị trí router và ESP32, hạn chế di chuyển trong giai đoạn này.'],
  UNKNOWN:['Chưa có dữ liệu CSI','Không có số đo hợp lệ gần đây. Firmware có thể chưa bật CSI hoặc ESP32 đang mất đường truyền.']
 }[state];
 $('roomState').textContent=t[0];$('roomInterpretation').textContent=t[1];
 $('room').dataset.roomState=state.toLowerCase();
 $('roomIcon').textContent=state==='MOVEMENT_CANDIDATE'?'⌁':state==='MICRO_VARIATION'?'≈':state==='CALIBRATING'?'◉':'◎';
 $('roomLive').textContent=recent?(state==='MOVEMENT_CANDIDATE'?'PHÁT HIỆN BIẾN ĐỘNG':state==='MICRO_VARIATION'?'DAO ĐỘNG NHỎ':state==='CALIBRATING'?'ĐANG HIỆU CHUẨN':'ĐANG NHẬN CSI'):'CHỜ DỮ LIỆU';
 $('roomSamples').textContent=recent?String(roomData.samples):'--';
 $('roomRssi').textContent=recent?roomData.rssi+' dBm':'--';
 $('roomScore').textContent=recent?(roomData.score/100).toFixed(2):'--';
 $('roomMicro').textContent=recent&&roomData.micro!==null?(roomData.micro/100).toFixed(2):'--';
 $('roomRate').textContent=recent&&roomData.rate!==null?(roomData.rate/10).toFixed(1)+' Hz':'--';
 $('roomTimestamp').textContent=recent?
  'Bản tin '+Math.max(0,Math.floor(Date.now()/1000-roomData.ts))+' giây trước':'Chưa nhận bản tin hợp lệ trong 45 giây';
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
 $('shutdown').disabled=!(connected&&agentOnline)||Boolean(pending)||Boolean(shutdownDeadline);
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
 roomData=null;lastCsiSeq=-1;renderRoom();
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
   if(a.id===CSI_STATUS_ID){applyRoomSignal(a);return}
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
  const sections=['dashboard','room','monitor','power','schedule','events'].map(id=>$(id));
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
    renderMonitor();
    renderRoom();
  },5000);
  setInterval(renderCountdown,1000);
  renderCountdown();updateState();refreshSchedulePreview();renderMonitor();renderRoom();
  if(loadConfig())connect();else openSettings(false);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();