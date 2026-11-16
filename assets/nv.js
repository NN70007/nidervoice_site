/* NiderVoice — langue, en-tête, menu, sommaire et fond de points réactif. Aucun appel réseau. */
(function(){
  var html=document.documentElement;
  var LANGS=(html.getAttribute('data-langs')||'fr en es de').split(' ');
  function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
  function pick(l){return LANGS.indexOf(l)>=0?l:(LANGS.indexOf('en')>=0?'en':LANGS[0])}
  function setLang(l,save){
    var want=l;l=pick(l);html.lang=l;
    if(save)store('nv-lang',want);
    document.querySelectorAll('.lang button').forEach(function(b){
      b.hidden=LANGS.indexOf(b.dataset.lang)<0;b.setAttribute('aria-pressed',b.dataset.lang===l);
    });
    document.dispatchEvent(new CustomEvent('nv-lang',{detail:l}));
  }
  var saved=store('nv-lang');
  var nav=((navigator.languages&&navigator.languages[0])||navigator.language||'en').slice(0,2).toLowerCase();
  setLang(saved||nav,false);
  document.querySelectorAll('.lang button').forEach(function(b){b.addEventListener('click',function(){setLang(b.dataset.lang,true)})});

  var head=document.querySelector('header');
  if(head){
    window.addEventListener('scroll',function(){head.classList.toggle('scrolled',window.scrollY>10)},{passive:true});
    var mb=head.querySelector('.menu-btn');
    if(mb)mb.addEventListener('click',function(){var o=head.classList.toggle('open');mb.setAttribute('aria-expanded',o)});
  }

  // Sommaire : met en évidence la section lue.
  var toc=[].slice.call(document.querySelectorAll('.toc a'));
  if(toc.length&&'IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){toc.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)})}})},{rootMargin:'-30% 0px -60% 0px'});
    toc.forEach(function(a){var s=document.querySelector(a.getAttribute('href'));if(s)io.observe(s)});
  }

  // Fond de points : les points proches du pointeur s'éclairent et s'écartent légèrement.
  var cv=document.getElementById('dots');
  if(!cv||!cv.getContext)return;
  var ctx=cv.getContext('2d'),dpr=Math.min(window.devicePixelRatio||1,2),W=0,H=0,GAP=26,R=150;
  var mx=-9999,my=-9999,tx=-9999,ty=-9999,raf=0;
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size(){W=window.innerWidth;H=window.innerHeight;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
  function draw(){
    ctx.clearRect(0,0,W,H);
    var fade=Math.max(.25,1-window.scrollY/1400);
    for(var y=GAP/2;y<H;y+=GAP){for(var x=GAP/2;x<W;x+=GAP){
      var dx=x-mx,dy=y-my,d=Math.sqrt(dx*dx+dy*dy),k=d<R?1-d/R:0,px=x,py=y;
      if(k>0&&d>0){px+=dx/d*k*7;py+=dy/d*k*7}
      var vfade=Math.max(0,1-y/(H*1.1));
      ctx.fillStyle=k>0?'rgba(140,192,242,'+(0.16+0.6*k)+')':'rgba(255,255,255,'+(0.07*vfade*fade+0.02)+')';
      ctx.beginPath();ctx.arc(px,py,0.9+1.4*k,0,6.283);ctx.fill();
    }}
  }
  function loop(){mx+=(tx-mx)*.18;my+=(ty-my)*.18;draw();if(Math.abs(tx-mx)>.5||Math.abs(ty-my)>.5)raf=requestAnimationFrame(loop);else raf=0}
  function kick(){if(!raf)raf=requestAnimationFrame(loop)}
  window.addEventListener('resize',size);
  window.addEventListener('scroll',function(){if(!raf)raf=requestAnimationFrame(function(){raf=0;draw()})},{passive:true});
  if(!reduce&&window.matchMedia('(pointer:fine)').matches){
    window.addEventListener('pointermove',function(e){tx=e.clientX;ty=e.clientY;if(mx<-5000){mx=tx;my=ty}kick()},{passive:true});
    document.addEventListener('pointerleave',function(){tx=ty=-9999;mx=my=-9999;draw()});
  }
  size();
})();
