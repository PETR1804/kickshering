import { animations } from './animation-config.js';
// Native DOM media preserves GIF animation; do not draw GIF frames to canvas.
export function createMediaEffect(host) {
  const plane = document.createElement('div');
  plane.className='camera-overlay';
  Object.assign(plane.style,{position:'absolute',left:'0',top:'0',transformOrigin:'0 0',width:'1120px',height:'1000px',pointerEvents:'none'});
  host.append(plane);
  let current=null, media=null, failed=false;
  return {
    plane,
    update(active, show, transform) {
      plane.hidden=!show;
      if (transform) plane.style.transform=transform;
      const config=active && animations[active.step.id];
      if (current!==config) {
        media?.pause?.(); plane.replaceChildren(); current=config; failed=false; media=null;
        if (config) {
          const video=/\.(mp4|webm)(\?|$)/i.test(config.src);
          media=document.createElement(video?'video':'img');
          media.addEventListener('error',()=>{ failed=true; plane.hidden=true; console.warn('Animation unavailable:',config.src); });
          if (video) { media.muted=true; media.loop=true; media.playsInline=true; media.autoplay=true; }
          media.src=config.src;
          Object.assign(media.style,{position:'absolute',width:(config.width||180)+'px',height:(config.height||180)+'px',objectFit:'contain',transform:'translate(-50%,-50%)'});
          plane.append(media);
          if(video) media.play().catch(()=>{failed=true;});
        }
      }
      const point=active?.layout[active.step.id];
      if (media && point) {
        media.style.left=(560+point[0]*1120+(config.offsetX||0))+'px';
        media.style.top=(500-point[1]*1120+(config.offsetY||0))+'px';
        if (media.tagName==='VIDEO') {
          if (!show) media.pause();
          else if(media.paused && !failed) media.play().catch(()=>{failed=true;});
        }
      }
      if(failed) plane.hidden=true;
      return Boolean(config && !failed && (media.tagName==='VIDEO' ? media.readyState>=2 : media.complete && media.naturalWidth));
    },
    dispose(){media?.pause?.(); plane.remove();}
  };
}
