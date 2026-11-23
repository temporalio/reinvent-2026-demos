/* Reflect travel at the logo bands; padding contains every rotated corner. */
(function(root) {
  root.asteroidTravelBounds=function(top,bottom,width) {
    const height=width*70.88/94.26;
    const radius=Math.hypot(width,height)/2;
    return {min:top+radius-height/2+12,max:bottom-radius-height/2-12};
  };
  root.reflectAsteroidPosition=function(value,min,max) {
    if(max<=min)return (min+max)/2;
    const span=max-min,period=2*span;
    const folded=((value-min)%period+period)%period;
    return folded<=span?min+folded:max-(folded-span);
  };
})(typeof window==='undefined'?globalThis:window);
