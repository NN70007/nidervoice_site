(function(){
  var html=document.documentElement;
  document.addEventListener('nv-lang',function(){restart()});
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fenêtre de démonstration : le texte s'écrit pendant que l'onde bouge.
  var texts={fr:"Bonjour à tous,\nJe vous confirme notre réunion de jeudi à 14 heures. Merci d'apporter les chiffres du trimestre.",en:"Hello everyone,\nI am confirming our meeting on Thursday at 2 pm. Please bring the figures for the quarter.",es:"Hola a todos:\nLes confirmo nuestra reunión del jueves a las 14:00. Por favor, traigan las cifras del trimestre.",de:"Hallo zusammen,\nich bestätige unser Treffen am Donnerstag um 14 Uhr. Bitte bringen Sie die Quartalszahlen mit."};
  var demo=document.getElementById('demo'), wave=demo.querySelector('.wave'), out=document.getElementById('typed');
  var hs=[];
  for(var k=0;k<120;k++){var s=document.createElement('span');var h=6+Math.round(26*Math.abs(Math.sin(k*1.7)*Math.cos(k*.37)));hs.push(h);s.style.height=h+'px';wave.appendChild(s)}
  var timer=null,frame=null;
  function animateWave(){var t=0;frame=setInterval(function(){t++;wave.querySelectorAll('span').forEach(function(s,i){s.style.height=Math.max(4,hs[i]*(0.45+0.55*Math.abs(Math.sin((t+i*2)/4))))+'px'})},80)}
  function show(txt){out.innerHTML='';txt.split('\n').forEach(function(l,i){if(i)out.appendChild(document.createElement('br'));out.appendChild(document.createTextNode(l))})}
  function run(){var txt=texts[html.lang]||texts.fr;if(reduce){demo.classList.add('done');show(txt);return}
    demo.classList.remove('done');show('');animateWave();var i=0;
    timer=setTimeout(function type(){show(txt.slice(0,++i));if(i<txt.length){timer=setTimeout(type,38)}else{clearInterval(frame);demo.classList.add('done');timer=setTimeout(run,5000)}},800)}
  function stop(){clearTimeout(timer);clearInterval(frame)}
  function restart(){stop();run()}
  document.addEventListener('visibilitychange',function(){document.hidden?stop():restart()});
  run();

  var bw=document.querySelector('.big-wave');
  for(var j=0;j<28;j++){var b=document.createElement('span');b.style.height=(30+Math.round(100*Math.abs(Math.sin(j*.55))))+'px';b.style.animationDelay=(j*0.06)+'s';bw.appendChild(b)}

  // Étapes : la scène de droite suit l'étape au centre de l'écran.
  var steps=[].slice.call(document.querySelectorAll('.step')), scenes=[].slice.call(document.querySelectorAll('.scene'));
  function activate(i){steps.forEach(function(s){s.classList.toggle('on',s.dataset.s==i)});scenes.forEach(function(s){s.classList.toggle('on',s.dataset.s==i)})}
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)activate(e.target.dataset.s)})},{rootMargin:'-45% 0px -45% 0px'});
    steps.forEach(function(s){io.observe(s)});
    var ro=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');ro.unobserve(e.target)}})},{threshold:.15});
    document.querySelectorAll('.reveal').forEach(function(r){ro.observe(r)});
  } else { document.querySelectorAll('.reveal').forEach(function(r){r.classList.add('in')}) }
})();
