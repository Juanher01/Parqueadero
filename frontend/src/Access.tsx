import {useEffect,useRef,useState,type DragEvent,type FormEvent} from 'react'
import {useSearchParams} from 'react-router-dom'
import {AlertTriangle,ArrowDownLeft,ArrowUpRight,Camera,Check,CheckCircle2,ImagePlus,Loader2,PencilLine,RefreshCw,ScanLine,ShieldCheck,UploadCloud,VideoOff,X} from 'lucide-react'
import {api,post,formatDate,duration} from './api'
import type {Parking,Space,Summary} from './types'

type Preview={plate:string;action:'entrada'|'salida';active_session:Parking|null;suggested_space:{id:number;code:string}|null}
type Candidate={plate:string;confidence:number;detection_confidence?:number;box:number[]}
type Scan={candidates:Candidate[];image_width?:number;image_height?:number}
type Phase='idle'|'processing'|'done'|'empty'|'error'
type Origin='auto'|'manual'|'link'
const STEPS=['Procesando imagen…','Detectando placa…','Reconociendo caracteres…']
const PHASES:Record<Phase|'camera',[string,string]>={idle:['En espera','bg-slate-100 text-slate-600'],camera:['Cámara activa','bg-sky-50 text-sky-700'],processing:['Procesando','bg-sky-50 text-sky-700'],done:['Placa detectada','bg-emerald-50 text-emerald-700'],empty:['Sin detección','bg-amber-50 text-amber-700'],error:['No disponible','bg-rose-50 text-rose-700']}
const ORIGINS:Record<Origin,string>={auto:'Reconocimiento automático',manual:'Corregida por el operador',link:'Desde vehículos dentro'}
const normalize=(value:string)=>value.toUpperCase().replace(/[\s-]/g,'')

export default function Access(){
  const [params]=useSearchParams(),initial=params.get('placa')||''
  const [plate,setPlate]=useState(initial),[origin,setOrigin]=useState<Origin|null>(initial?'link':null)
  const [file,setFile]=useState<File|null>(null),[imageUrl,setImageUrl]=useState(''),[natural,setNatural]=useState<{w:number;h:number}|null>(null)
  const [scan,setScan]=useState<Scan|null>(null),[selected,setSelected]=useState<Candidate|null>(null)
  const [phase,setPhase]=useState<Phase>('idle'),[step,setStep]=useState(0),[scanError,setScanError]=useState('')
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(''),[draftError,setDraftError]=useState('')
  const [preview,setPreview]=useState<Preview|null>(null),[spaces,setSpaces]=useState<Space[]>([]),[summary,setSummary]=useState<Summary|null>(null),[spaceId,setSpaceId]=useState('')
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[camera,setCamera]=useState(false)
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]),[device,setDevice]=useState(''),[dragging,setDragging]=useState(false),[now,setNow]=useState(Date.now())
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),canvas=useRef<HTMLCanvasElement>(null),picker=useRef<HTMLInputElement>(null),request=useRef(0)
  const clean=normalize(plate)
  useEffect(()=>{api<Space[]>('/espacios').then(setSpaces).catch(()=>{});api<Summary>('/dashboard/resumen').then(setSummary).catch(()=>{})},[])
  useEffect(()=>{setPreview(null);setSpaceId('');if(!/^[A-Z0-9]{4,8}$/.test(clean))return;const controller=new AbortController();const timer=setTimeout(async()=>{setChecking(true);try{const value=await api<Preview>(`/placas/preparar/${clean}`,{signal:controller.signal});setPreview(value);setSpaceId(value.suggested_space?.id.toString()||'');setError('')}catch(e){if(!controller.signal.aborted)setError((e as Error).message)}finally{if(!controller.signal.aborted)setChecking(false)}},300);return()=>{clearTimeout(timer);controller.abort()}},[clean])
  useEffect(()=>{if(camera&&video.current&&stream.current)video.current.srcObject=stream.current},[camera])
  useEffect(()=>()=>{stream.current?.getTracks().forEach(t=>t.stop())},[])
  useEffect(()=>{if(!file){setImageUrl('');return}const url=URL.createObjectURL(file);setImageUrl(url);setNatural(null);return()=>URL.revokeObjectURL(url)},[file])
  useEffect(()=>{if(phase!=='processing')return;setStep(0);const timer=setInterval(()=>setStep(s=>Math.min(s+1,STEPS.length-1)),900);return()=>clearInterval(timer)},[phase])
  useEffect(()=>{if(preview?.action!=='salida')return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[preview])

  function stop(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false)}
  async function open(id?:string){stop();try{const next=await navigator.mediaDevices.getUserMedia({video:id?{deviceId:{exact:id}}:{facingMode:'environment'},audio:false});stream.current=next;setCamera(true);setDevice(id||'');setDevices((await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput'));setError('')}catch{setError('No se pudo abrir la cámara. Revise los permisos y vuelva a intentarlo.')}}
  function capture(){if(!video.current||!canvas.current)return;canvas.current.width=video.current.videoWidth;canvas.current.height=video.current.videoHeight;canvas.current.getContext('2d')?.drawImage(video.current,0,0);canvas.current.toBlob(blob=>{if(blob)load(new File([blob],'captura.jpg',{type:'image/jpeg'}))},'image/jpeg',.9);stop()}
  function load(next:File){stop();setNotice('');setError('');setFile(next);void recognize(next)}
  function choose(item:Candidate){setSelected(item);setPlate(item.plate);setOrigin('auto');setEditing(false)}
  async function recognize(selectedFile:File){
    const id=++request.current
    setPhase('processing');setScanError('');setScan(null);setSelected(null);setPlate('');setOrigin(null);setEditing(false)
    try{
      const form=new FormData();form.append('file',selectedFile)
      const result=await api<Scan>('/reconocimiento/procesar',{method:'POST',body:form})
      if(id!==request.current)return
      setScan(result)
      if(result.candidates.length===1)choose(result.candidates[0])
      setPhase(result.candidates.length?'done':'empty')
    }catch(e){if(id!==request.current)return;setScanError((e as Error).message);setPhase('error')}
  }
  function reset(){request.current++;stop();setFile(null);setScan(null);setSelected(null);setPlate('');setOrigin(null);setPhase('idle');setScanError('');setEditing(false)}
  function startEdit(){setDraft(clean);setDraftError('');setEditing(true)}
  function applyEdit(e:FormEvent){e.preventDefault();const value=normalize(draft);if(!/^[A-Z0-9]{4,8}$/.test(value)){setDraftError('La placa debe tener entre 4 y 8 caracteres alfanuméricos.');return}setPlate(value);setOrigin('manual');setEditing(false)}
  function onDrop(e:DragEvent){e.preventDefault();setDragging(false);const next=e.dataTransfer.files?.[0];if(next&&!camera)load(next)}
  async function confirm(){if(!preview)return;setBusy(true);setError('');setNotice('');try{const result=await post<{action:string;session:Parking}>('/placas/confirmar',{plate:preview.plate,expected_action:preview.action,space_id:preview.action==='entrada'?Number(spaceId):null,recognized_plate:selected?.plate||null,confidence:selected?.confidence||null,method:selected?'automatico':'manual'});setNotice(result.action==='entrada'?`Ingreso autorizado · ${result.session.plate} · Espacio asignado ${result.session.space_code}`:`Salida registrada correctamente · ${result.session.plate} · Espacio ${result.session.space_code} liberado`);reset();setPreview(null);setSpaceId('');const [nextSpaces,nextSummary]=await Promise.all([api<Space[]>('/espacios'),api<Summary>('/dashboard/resumen')]);setSpaces(nextSpaces);setSummary(nextSummary)}catch(e){setError((e as Error).message);setPreview(null)}finally{setBusy(false)}}

  const dims=scan?.image_width&&scan.image_height?{w:scan.image_width,h:scan.image_height}:natural
  const candidates=scan?.candidates||[]
  const available=spaces.filter(s=>s.status==='disponible')
  const [phaseLabel,phaseTone]=PHASES[camera?'camera':phase]
  const stageText=camera?'Encuadre la placa del vehículo y tome la fotografía':phase==='processing'?STEPS[step]:phase==='done'?candidates.length>1&&!selected?`${candidates.length} placas detectadas · seleccione la correcta en la imagen`:'Placa localizada en la imagen':phase==='empty'?'No se identificó ninguna placa':phase==='error'?'El reconocimiento no se completó':'Capture o cargue la fotografía del vehículo'
  const fileInput=<input ref={picker} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" onChange={e=>{const next=e.target.files?.[0];e.target.value='';if(next)load(next)}}/>
  const correction=<form className="space-y-2" onSubmit={applyEdit}><label className="text-xs font-bold text-slate-600" htmlFor="plate-fix">Placa correcta</label><div className="flex gap-2"><input id="plate-fix" autoFocus className="input plate-fix" autoComplete="off" maxLength={12} placeholder="ABC123" value={draft} onChange={e=>{setDraft(e.target.value);setDraftError('')}}/><button className="btn btn-primary" type="submit" aria-label="Aplicar corrección"><Check size={17}/></button><button className="btn btn-light" type="button" onClick={()=>setEditing(false)} aria-label="Cancelar corrección"><X size={17}/></button></div>{draftError&&<p className="text-xs font-semibold text-rose-600">{draftError}</p>}</form>

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Operación principal</p><h1 className="page-title">Control de acceso</h1><p className="page-subtitle">Reconocimiento de placas y registro de ingresos y salidas.</p></div>
      <div className="flex gap-2"><div className="occupancy-chip"><span className="legend-dot bg-teal-500"/>Disponibles<strong>{summary?summary.available:'—'}</strong></div><div className="occupancy-chip"><span className="legend-dot bg-amber-500"/>Ocupados<strong>{summary?summary.occupied:'—'}</strong></div></div></div>
    {error&&<div className="notice notice-error flex items-center gap-2" role="alert"><AlertTriangle size={18}/>{error}</div>}
    {notice&&<div className="notice notice-success flex items-center gap-2" role="status"><CheckCircle2 size={18}/>{notice}</div>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,.85fr)]">
      <section className="panel overflow-hidden">
        <div className="station-head"><div className="flex items-center gap-3"><span className="section-icon"><ScanLine size={18}/></span><div><h2 className="text-[1.05rem] font-extrabold text-[var(--ink)]">Identificación del vehículo</h2><p className="text-xs text-slate-500" aria-live="polite">{stageText}</p></div></div><span className={`phase-chip ${phaseTone}`}><span className={`phase-dot ${phase==='processing'||camera?'animate-pulse':''}`}/>{phaseLabel}</span></div>
        <div className="p-4 sm:p-5">
          <div className={`vision-stage ${dragging?'vision-drag':''}`} onDragOver={e=>{e.preventDefault();if(!camera)setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}>
            <div className="vision-grid"/>{camera&&<div className="vision-hud"><i/>En vivo</div>}<span className="vision-corner tl"/><span className="vision-corner tr"/><span className="vision-corner bl"/><span className="vision-corner br"/>
            {camera?<div className="relative flex w-full flex-col items-center gap-3 p-4"><video ref={video} autoPlay playsInline muted className="vision-media"/><div className="flex flex-wrap justify-center gap-2"><button className="btn btn-primary" onClick={capture}><Camera size={17}/>Tomar foto</button><button className="btn btn-ghost-dark" onClick={stop}><VideoOff size={17}/>Cerrar cámara</button>{devices.length>1&&<select className="input w-auto" value={device} onChange={e=>open(e.target.value)}><option value="">Cámara principal</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||'Cámara disponible'}</option>)}</select>}</div></div>
            :imageUrl?<div className="vision-frame"><img src={imageUrl} alt="Fotografía del vehículo" className="vision-media" onLoad={e=>setNatural({w:e.currentTarget.naturalWidth,h:e.currentTarget.naturalHeight})}/>
              {phase==='done'&&dims&&candidates.map((item,i)=>{const [x1,y1,x2,y2]=item.box,active=selected===item;return <button key={i} type="button" className={`plate-box ${active?'plate-box-active':''}`} style={{left:`${x1/dims.w*100}%`,top:`${y1/dims.h*100}%`,width:`${(x2-x1)/dims.w*100}%`,height:`${(y2-y1)/dims.h*100}%`}} onClick={()=>choose(item)} title={`Seleccionar ${item.plate}`} aria-label={`Seleccionar placa ${item.plate}`} aria-pressed={active}><span className={`plate-tag ${y1/dims.h<.14?'plate-tag-below':''}`}>{active&&<Check size={13} strokeWidth={3}/>}{item.plate}<em>{Math.round(item.confidence*100)}%</em></span></button>})}
              {phase==='processing'&&<div className="scan-overlay"><div className="scan-line"/><div className="scan-card"><div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-white"><ScanLine size={17} className="text-teal-300"/>Analizando imagen</div>{STEPS.map((label,i)=><div key={label} className={`scan-step ${i<step?'done':i===step?'active':''}`}>{i<step?<Check size={15}/>:i===step?<Loader2 size={15} className="animate-spin"/>:<span className="scan-step-dot"/>}{label}</div>)}</div></div>}
            </div>
            :<div className="stage-placeholder"><div className="stage-icon"><ScanLine size={34}/></div><h3>Sin imagen del vehículo</h3><p className="mx-auto mt-1 max-w-sm text-sm">Abra la cámara o cargue una fotografía. La imagen se analizará automáticamente para localizar la placa.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button className="btn btn-primary" onClick={()=>open()}><Camera size={17}/>Abrir cámara</button><button className="btn btn-ghost-dark" onClick={()=>picker.current?.click()}><UploadCloud size={17}/>Subir imagen</button></div><p className="mt-4 text-xs text-slate-400">También puede arrastrar una imagen aquí · JPEG, PNG o WebP hasta 8 MB</p></div>}
            {!camera&&imageUrl&&(phase==='empty'||phase==='error')&&<div className={`stage-message ${phase==='error'?'stage-message-error':''}`} role="alert"><AlertTriangle size={20} className="flex-none"/><div className="min-w-0 flex-1"><strong className="block">{phase==='empty'?'No fue posible identificar una placa en esta imagen':'No fue posible procesar la imagen'}</strong><span className="text-xs opacity-80">{phase==='empty'?'Intente con una fotografía más cercana y nítida de la placa.':scanError}</span></div><div className="flex flex-wrap gap-2"><button className="btn btn-stage" onClick={()=>file&&recognize(file)}><RefreshCw size={15}/>Reintentar</button><button className="btn btn-stage" onClick={()=>picker.current?.click()}><ImagePlus size={15}/>Otra imagen</button></div></div>}
          </div>
          {fileInput}<canvas ref={canvas} className="hidden"/>
          {!camera&&imageUrl&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 text-xs text-slate-500"><span className="block truncate font-semibold text-slate-700">{file?.name}</span>{dims&&`${dims.w} × ${dims.h} px`}{file&&` · ${(file.size/1024).toFixed(0)} KB`}</div><div className="flex flex-wrap gap-2"><button className="btn btn-light" disabled={phase==='processing'} onClick={()=>file&&recognize(file)}><RefreshCw size={16}/>Volver a analizar</button><button className="btn btn-light" onClick={()=>open()}><Camera size={16}/>Cámara</button><button className="btn btn-light" onClick={()=>picker.current?.click()}><ImagePlus size={16}/>Otra imagen</button><button className="btn btn-light" onClick={reset} aria-label="Quitar imagen"><X size={16}/></button></div></div>}
          {phase==='done'&&candidates.length>1&&<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="mb-3 text-sm font-bold text-slate-700">Se detectaron {candidates.length} placas. Seleccione la correcta en la imagen o aquí:</p><div className="flex flex-wrap gap-2">{candidates.map((item,i)=><button key={i} className={`candidate ${selected===item?'candidate-active':''}`} onClick={()=>choose(item)}>{item.plate} <span>{Math.round(item.confidence*100)}%</span></button>)}</div></div>}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="panel overflow-hidden">
          <div className="panel-heading"><span className="section-icon"><ShieldCheck size={18}/></span><div><h2>Resultado del reconocimiento</h2><p>Revise el movimiento y confírmelo</p></div></div>
          <div className="space-y-5 p-6">
            {plate?<>
              <div><div className="flex items-center justify-between gap-2"><span className="result-label">Placa identificada</span>{origin&&<span className={`badge whitespace-nowrap ${origin==='manual'?'badge-amber':'badge-green'}`}>{ORIGINS[origin]}</span>}</div>
                <div className="plate-display">{clean}</div>
                {selected&&origin==='auto'&&<div className="mt-3 flex items-center gap-3 text-xs text-slate-500"><span className="whitespace-nowrap">Confianza OCR</span><div className="conf-bar flex-1"><i style={{width:`${Math.round(selected.confidence*100)}%`}}/></div><strong className="text-slate-700">{Math.round(selected.confidence*100)}%</strong></div>}
                {origin==='manual'&&selected&&<p className="mt-2 text-xs text-slate-500">Lectura automática original: <strong>{selected.plate}</strong></p>}
                <div className="mt-3">{editing?correction:<button className="link-btn" onClick={startEdit}><PencilLine size={15}/>Corregir placa</button>}</div></div>
              {checking||(!preview&&/^[A-Z0-9]{4,8}$/.test(clean)&&!error)?<div className="movement-skeleton"><Loader2 size={18} className="animate-spin"/>Verificando estado del vehículo…</div>
              :preview?<>
                <div className={`movement-card ${preview.action==='entrada'?'movement-entry':'movement-exit'}`}><div className="movement-icon">{preview.action==='entrada'?<ArrowDownLeft size={26}/>:<ArrowUpRight size={26}/>}</div><div><span className="result-label !text-current opacity-75">Movimiento detectado</span><p className="movement-value">{preview.action==='entrada'?'Ingreso':'Salida'}</p><p className="text-xs font-semibold opacity-80">{preview.action==='entrada'?'Vehículo sin ingreso vigente':'Vehículo dentro del parqueadero'}</p></div></div>
                {preview.action==='entrada'?<>
                  <div className="grid grid-cols-2 gap-3"><div className="info-tile"><span>Espacio sugerido</span><strong>{preview.suggested_space?.code||'—'}</strong></div><div className="info-tile"><span>Espacios disponibles</span><strong>{available.length}</strong></div></div>
                  {available.length?<div><label className="mb-1 block text-xs font-bold text-slate-600" htmlFor="space">Espacio asignado</label><select id="space" className="input" value={spaceId} onChange={e=>setSpaceId(e.target.value)}><option value="">Seleccione un espacio</option>{available.map(s=><option key={s.id} value={s.id}>{s.code}{s.id===preview.suggested_space?.id?' · sugerido':''}</option>)}</select></div>:<p className="notice notice-error">No hay espacios disponibles para registrar el ingreso.</p>}
                  <button className="btn btn-go btn-confirm" disabled={busy||!spaceId} onClick={confirm}><ShieldCheck size={19}/>{busy?'Registrando movimiento…':'Confirmar ingreso'}</button>
                </>:<>
                  <div className="grid grid-cols-2 gap-3"><div className="info-tile"><span>Espacio ocupado</span><strong>{preview.active_session?.space_code}</strong></div><div className="info-tile"><span>Tiempo de permanencia</span><strong>{duration(Math.max(0,(now-new Date(preview.active_session!.entry_at).getTime())/1000))}</strong></div><div className="info-tile col-span-2"><span>Hora de ingreso</span><strong className="!text-base">{formatDate(preview.active_session?.entry_at||null)}</strong></div></div>
                  <button className="btn btn-exit btn-confirm" disabled={busy} onClick={confirm}><ShieldCheck size={19}/>{busy?'Registrando movimiento…':'Confirmar salida'}</button>
                </>}
              </>:null}
            </>
            :phase==='processing'?<div className="empty-preview"><Loader2 size={30} className="animate-spin text-teal-600"/><h3>Analizando imagen</h3><p>El resultado aparecerá aquí cuando se identifique la placa.</p></div>
            :phase==='done'&&candidates.length>1?<div className="empty-preview"><ScanLine size={30}/><h3>Seleccione la placa</h3><p>Se detectaron varias placas. Elija la correcta sobre la imagen.</p></div>
            :phase==='empty'||phase==='error'?<div className="space-y-4"><div className="empty-preview !min-h-[11rem]"><AlertTriangle size={30} className="text-amber-500"/><h3>Sin placa identificada</h3><p>{phase==='empty'?'El sistema no localizó una placa legible en la imagen.':scanError}</p></div>{editing?correction:<button className="btn btn-light w-full" onClick={startEdit}><PencilLine size={16}/>Ingresar placa manualmente</button>}</div>
            :<div className="space-y-3 py-2"><p className="text-sm font-bold text-slate-600">Esperando un vehículo</p>{['Capture o cargue la fotografía del vehículo','El sistema localiza y lee la placa','Confirme el ingreso o la salida'].map((text,i)=><div key={text} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><span className="step-number !h-7 !w-7 !rounded-lg">{i+1}</span>{text}</div>)}</div>}
          </div>
        </section>
        <div className="overflow-hidden rounded-2xl bg-[var(--asphalt)] text-sm text-slate-300"><div className="barrier opacity-90"/><div className="p-5"><div className="mb-2 flex items-center gap-2 font-bold text-white"><CheckCircle2 size={18} className="text-[var(--yellow)]"/>Confirmación requerida</div>Ningún movimiento se registra sin la confirmación del operador.</div></div>
      </aside>
    </div>
  </div>
}
