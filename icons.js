'use strict';
/* Tung Lam Automation: self-hosted vector icons (no emoji font dependency). */
(() => {
 const paths={
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 power:'<path d="M12 2v10"/><path d="M6.1 6.1a8 8 0 1 0 11.8 0"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 logs:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h6"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l-1.9 1.9a1.7 1.7 0 0 0-1.86-.35l-.96.4-.4 1.72H9.38l-.4-1.72-.96-.4a1.7 1.7 0 0 0-1.87.34l-1.9-1.9a1.7 1.7 0 0 0 .35-1.86l-.4-.96L2.5 13.6V10.4l1.72-.4.4-.96a1.7 1.7 0 0 0-.35-1.86l1.9-1.9a1.7 1.7 0 0 0 1.86.35l.96-.4.4-1.72h5.24l.4 1.72.96.4a1.7 1.7 0 0 0 1.86-.35l1.9 1.9a1.7 1.7 0 0 0-.35 1.86l.4.96 1.72.4v3.2l-1.72.4-.4.96Z"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7.5 7.5 0 0 1 13-2L20 12M4 12l1.4 5a7.5 7.5 0 0 0 13-2"/>',
 cloud:'<path d="M7 18H6a4 4 0 0 1-.8-7.9A7 7 0 0 1 18.7 9a4.5 4.5 0 0 1-.7 9H7Z"/>',
 chip:'<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
 monitor:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
 bolt:'<path d="m13 2-9 12h7l-1 8 10-12h-7l0-8Z"/>',
 stop:'<circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
 close:'<path d="M5 5l14 14M19 5 5 19"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 shield:'<path d="M12 2 4 6v6c0 5 3.4 8.1 8 10 4.6-1.9 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
 back:'<path d="M3 11v5h5M4 16a8 8 0 1 0 2-9"/>'
 };
 const svg=name=>'<svg class="tl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
 const put=(selector,name)=>document.querySelectorAll(selector).forEach(e=>{e.innerHTML=svg(name)});
 const replaceLeading=(selector,name)=>document.querySelectorAll(selector).forEach(e=>{
   const n=e.firstChild;
   if(n?.nodeType===Node.TEXT_NODE && /^[\s⏻⏼◷✕↩⚡]+/.test(n.textContent)){
     n.textContent=n.textContent.replace(/^[\s⏻⏼◷✕↩⚡]+/,' ');
     e.insertAdjacentHTML('afterbegin',svg(name));
   }
 });
 const mapping=[
 ['.nav-links .nav-item:nth-child(1) .nav-icon','grid'],
 ['.nav-links .nav-item:nth-child(2) .nav-icon','power'],
 ['.nav-links .nav-item:nth-child(3) .nav-icon','clock'],
 ['.nav-links .nav-item:nth-child(4) .nav-icon','logs'],
 ['#themeToggle','sun'],['#themeMobile','sun'],
 ['#configOpen','settings'],['#reconnect','refresh'],
 ['.hero-ring span','power'],
 ['.metric-icon.cyan','cloud'],['.metric-icon.mint','chip'],
 ['.metric-icon.blue','monitor'],['.metric-icon.amber','clock'],
 ['#power .section-icon','bolt'],['#schedule .section-icon','clock'],
 ['.action-start .tile-icon','power'],['.action-stop .tile-icon','stop']
 ];
 for(const [selector,name] of mapping) {
   if(selector==='#themeToggle'||selector==='#configOpen'){document.querySelectorAll(selector).forEach(e=>{const span=e.querySelector('span'); e.innerHTML=svg(name)+(span?'<span>'+span.textContent+'</span>':'')});}
   else put(selector,name);
 }
 replaceLeading('#wake','power');replaceLeading('#shutdown','stop');
 replaceLeading('#scheduleBtn','clock');replaceLeading('#cancelSchedule','close');
 replaceLeading('#cancel','back');
 document.querySelectorAll('.btn > span').forEach(e=>{if(e.textContent.trim()==='→')e.innerHTML=svg('arrow')});
})();