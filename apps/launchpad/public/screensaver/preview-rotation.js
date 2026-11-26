/* Timed preview selection only. This controller never navigates or launches demos. */
(function(root) {
  root.createPreviewRotation = function({count,onSelect,delay=5000,schedule=setTimeout,cancel=clearTimeout}) {
    let last=-1,pending=null,waiting=false,hidden=false,stopped=false;
    function clear(){if(pending!==null){cancel(pending);pending=null;}}
    function arm(){
      clear();
      if(!waiting||hidden||stopped||count<2)return;
      pending=schedule(()=>{pending=null;waiting=false;last=(last+1)%count;onSelect(last);},delay);
    }
    return {
      selected(index){last=index;waiting=false;clear();},
      closed(){waiting=true;arm();},
      setHidden(value){hidden=value;arm();},
      stop(){stopped=true;waiting=false;clear();},
    };
  };
})(typeof window==='undefined'?globalThis:window);
