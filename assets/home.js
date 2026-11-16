/* NiderVoice — accueil : démonstration (dictée + moniteur réseau) et étapes. Aucun appel réseau. */
(function(){
  var html=document.documentElement;
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var texts={
    fr:"Compte rendu du comité de direction.\nLes décisions restent confidentielles jusqu'à la publication du rapport annuel. Merci de ne pas les diffuser.",
    en:"Minutes of the executive committee.\nThe decisions remain confidential until the annual report is published. Please do not circulate them.",
    es:"Acta del comité de dirección.\nLas decisiones son confidenciales hasta la publicación del informe anual. Por favor, no las difundan.",
    de:"Protokoll der Geschäftsleitung.\nDie Beschlüsse bleiben bis zur Veröffentlichung des Jahresberichts vertraulich. Bitte nicht weitergeben."
  };
  var demo=document.getElementById('demo');
  if(demo){
    var wave=demo.querySelector('.wave'),out=document.getElementById('typed'),wc=document.getElementById('wcount'),hs=[];
    for(var k=0;k<120;k++){var s=document.createElement('span');var h=6+Math.round(26*Math.abs(Math.sin(k*1.7)*Math.cos(k*.37)));hs.push(h);s.style.height=h+'px';wave.appendChild(s)}
    var timer=null,frame=null;
    var animateWave=function(){var t=0;frame=setInterval(function(){t++;wave.querySelectorAll('span').forEach(function(s,i){s.style.height=Math.max(4,hs[i]*(0.45+0.55*Math.abs(Math.sin((t+i*2)/4))))+'px'})},80)};
    var show=function(txt){out.innerHTML='';txt.split('\n').forEach(function(l,i){if(i)out.appendChild(document.createElement('br'));out.appendChild(document.createTextNode(l))});
      if(wc){var n=(txt.match(/[\wÀ-ÿ'’-]+/g)||[]).length;wc.textContent=n}};
    var run=function(){var txt=texts[html.lang]||texts.en;if(reduce){demo.classList.add('done');show(txt);return}
      demo.classList.remove('done');show('');animateWave();var i=0;
      timer=setTimeout(function type(){show(txt.slice(0,++i));if(i<txt.length){timer=setTimeout(type,36)}else{clearInterval(frame);demo.classList.add('done');timer=setTimeout(run,5000)}},700)};
    var stop=function(){clearTimeout(timer);clearInterval(frame)};
    document.addEventListener('nv-lang',function(){stop();run()});
    document.addEventListener('visibilitychange',function(){if(document.hidden)stop();else{stop();run()}});
    run();
  }
  var bw=document.querySelector('.big-wave');
  if(bw)for(var j=0;j<28;j++){var b=document.createElement('span');b.style.height=(30+Math.round(100*Math.abs(Math.sin(j*.55))))+'px';b.style.animationDelay=(j*0.06)+'s';bw.appendChild(b)}
  var steps=[].slice.call(document.querySelectorAll('.step')),scenes=[].slice.call(document.querySelectorAll('.scene'));
  function activate(i){steps.forEach(function(s){s.classList.toggle('on',s.dataset.s==i)});scenes.forEach(function(s){s.classList.toggle('on',s.dataset.s==i)})}
  if(steps.length&&'IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)activate(e.target.dataset.s)})},{rootMargin:'-45% 0px -45% 0px'});
    steps.forEach(function(s){io.observe(s)});
  }
})();
