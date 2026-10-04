/** Test composition only; no native or DSMM production bundle is rewritten. */
export const COMPOSITION_ID = "@dsmm/profile-ui-acceptance";

export function compositionBundle() {
  return `window.__ModuleLoader__.load({id:${JSON.stringify(COMPOSITION_ID)},factory(require){
    const React=require('react');
    const {installConnection}=require('@deepseek-ai/dsh-client-connection/client');
    const {LocaleRuntime}=require('@deepseek-ai/dsh-client-locale/client');
    return {inject:['slots'],apply(ctx){
      installConnection(ctx,{transport:{rpc:window.__dsmmOwnedCarrier,ownsHost:true}});
      const locale=new LocaleRuntime(ctx,undefined,{languages:['en'],preference:'en'});
      ctx.provide('locale',locale);
      ctx.slots.installLocale(locale);
      // The owned component surface is vertically scrollable; it is not the
      // production application's fixed-height settings-shell layout.
      document.body.style.overflow='auto';
      document.getElementById('root').style.height='auto';
      document.getElementById('root').style.overflow='visible';
      ctx.slots.register({name:'root',children:{'settings.section':{kind:'list',scope:'root'}}},
        ({renderSlot})=>React.createElement('main',{'data-profile-ui-harness':'',style:{padding:'24px',width:'100%',minWidth:0,boxSizing:'border-box'}},
          renderSlot('settings.section',{}, {only:'dsmm-profiles'})));
      window.__dsmmUiContext=ctx;
      window.__dsmmNativeSeedProof={reactVersion:React.version,primitiveNames:Object.keys(require('@deepseek-ai/dsh-client-ui-primitives')).filter(name=>name==='Button'||name==='Input')};
    }};
  }});`;
}

export function bootstrapFacade() {
  return `window.__ModuleLoader__={mode:'queue',pendingQueue:[],load(row){this.pendingQueue.push(row)},create(options){
    const at=this.pendingQueue.findIndex(row=>row.id==='@deepseek-ai/dsh-client-modules');
    if(at<0)throw new Error('Native modules bootstrap missing');
    const row=this.pendingQueue.splice(at,1)[0];
    const exports=row.factory(()=>{throw new Error('Bootstrap requested an unseeded module')});
    const system=exports.createClientModuleSystem(this,{id:row.id,exports},options);
    // These two libraries are consumed by the owned composition, not activated
    // as their ordinary Web plugins. The native module table remains intact.
    system.manifest={...system.manifest,plugins:system.manifest.plugins.filter(row=>
      row.id!=='@deepseek-ai/dsh-client-connection'&&row.id!=='@deepseek-ai/dsh-client-locale')};
    window.__dsmmNativeModules=system;
    return system;
  }};`;
}

/** The only bridge is a Playwright-owned binding, not an HTTP API route. */
export function carrierBootstrap() {
  return `(()=>{
    let sequence=0;
    const request=value=>window.__dsmmNativeBridge(value);
    window.__dsmmOwnedCarrier={
      async call(channel,endpoint,payload,signal){
        const id='call-'+(++sequence);
        const cancel=()=>{void request({operation:'cancel',id})};
        signal?.addEventListener('abort',cancel,{once:true});
        try{
          if(signal?.aborted)return {ok:false,error:{code:'gateway/cancelled',message:'Cancelled',details:{}}};
          return await request({operation:'call',id,channel,endpoint,payload});
        }finally{signal?.removeEventListener('abort',cancel)}
      },
      async *open(channel,endpoint,payload,signal){
        const id='stream-'+(++sequence);
        const cancel=()=>{void request({operation:'cancel',id})};
        signal.addEventListener('abort',cancel,{once:true});
        try{
          if(signal.aborted)return;
          const opened=await request({operation:'open',id,channel,endpoint,payload});
          if(!opened.ok)throw Object.assign(new Error(opened.error.message),opened.error);
          while(!signal.aborted){
            const item=await request({operation:'next',id});
            if(!item.ok)throw Object.assign(new Error(item.error.message),item.error);
            if(item.value.done)return;
            yield item.value.value;
          }
        }finally{signal.removeEventListener('abort',cancel);await request({operation:'cancel',id})}
      }
    };
  })();`;
}

export function createBootGraph(rows, revision) {
  const entries = rows.map(({ id, url, inject = [], external = [] }) => ({ id, url, rev: revision, inject, external, immediately: true }));
  return { rev: revision, entries, batches: entries.map(({ id, url, rev }) => ({ phase: id === "@deepseek-ai/dsh-client-modules" ? "bootstrap" : "application", url, rev, entries: [id] })) };
}
