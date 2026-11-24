import {useEffect,useState} from 'react'
import {ArrowDownToLine,ArrowUpFromLine,Ban,Car,MousePointerClick,ParkingSquare,Plus,RefreshCw,Settings2,Timer} from 'lucide-react'
import {api,patch,post,formatDate,duration} from './api'
import type {Space} from './types'
import {Lane,StallContent,stallTone,statusLabel} from './ParkingVisuals'

export default function SpacesPage(){
  const [spaces,setSpaces]=useState<Space[]>([]),[rows,setRows]=useState(5),[cols,setCols]=useState(6)
  const [selected,setSelected]=useState<Space|null>(null),[admin,setAdmin]=useState(false),[code,setCode]=useState('')
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[loading,setLoading]=useState(true)
  async function refresh(){setLoading(true);try{const [items,config]=await Promise.all([api<Space[]>('/espacios'),api<{layout_rows:number;layout_cols:number}>('/configuracion')]);setSpaces(items);setRows(config.layout_rows);setCols(config.layout_cols);setError('')}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
  useEffect(()=>{refresh()},[])
  const positions=new Map(spaces.map(s=>[`${s.row_index}-${s.col_index}`,s]))
  const active=selected?spaces.find(s=>s.id===selected.id):null
  async function change(task:()=>Promise<unknown>,success:string){setError('');setMessage('');try{await task();setMessage(success);await refresh()}catch(e){setError((e as Error).message)}}
  async function choose(row:number,col:number){const target=positions.get(`${row}-${col}`);if(admin&&selected){if(target?.id===selected.id){setSelected(null);return}await change(()=>patch(`/espacios/${selected.id}`,{row_index:row,col_index:col}),'Posición actualizada');setSelected(null)}else setSelected(target||null)}
  async function create(){const empty=Array.from({length:rows*cols},(_,i)=>({row:Math.floor(i/cols),col:i%cols})).find(p=>!positions.has(`${p.row}-${p.col}`));if(!empty){setError('Amplíe el plano para crear otro espacio.');return}if(!code.trim()){setError('Escriba el código del espacio.');return}await change(()=>post('/espacios',{code,row_index:empty.row,col_index:empty.col}),'Espacio creado');setCode('')}

  const counts={disponible:spaces.filter(s=>s.status==='disponible').length,ocupado:spaces.filter(s=>s.status==='ocupado').length,fuera_servicio:spaces.filter(s=>s.status==='fuera_servicio').length}
  const total=Math.max(1,spaces.length)
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Distribución interior</p><h1 className="page-title">Plano de espacios</h1><p className="page-subtitle">Consulte la ocupación y administre la ubicación de cada espacio.</p></div><div className="flex gap-2"><button className="btn btn-light" onClick={refresh}><RefreshCw size={17}/>Actualizar</button><button className={`btn ${admin?'btn-dark':'btn-primary'}`} onClick={()=>{setAdmin(!admin);setSelected(null)}}><Settings2 size={17}/>{admin?'Cerrar administración':'Administrar plano'}</button></div></div>
    {error&&<div className="notice notice-error" role="alert">{error}</div>}{message&&<div className="notice notice-success" role="status">{message}</div>}

    <div className="grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.3fr)]">
      {([['Disponibles','disponible','var(--green)','P'],['Ocupados','ocupado','var(--orange)',null],['Fuera de servicio','fuera_servicio','var(--off)',null]] as const).map(([label,status,color,mark])=><div className="status-tile" key={status}><span className="status-sign" style={{background:color}}>{mark??(status==='ocupado'?<Car size={22}/>:<Ban size={22}/>)}</span><div><strong>{loading?'—':counts[status]}</strong><span>{label}</span></div></div>)}
      <div className="status-tile flex-col !items-stretch justify-center !gap-2"><div className="flex items-center justify-between text-sm"><span>Capacidad del parqueadero</span><b className="text-[var(--ink)]">{loading?'—':`${spaces.length} espacios`}</b></div><div className="cap-bar bg-slate-100">{!loading&&<><i style={{width:`${counts.disponible/total*100}%`,background:'var(--green)'}}/><i style={{width:`${counts.ocupado/total*100}%`,background:'var(--orange)'}}/><i style={{width:`${counts.fuera_servicio/total*100}%`,background:'var(--off)'}}/></>}</div></div>
    </div>

    {loading?<div className="panel p-8">Cargando plano…</div>:<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="panel overflow-hidden">
        <div className="panel-heading flex-wrap justify-between"><div className="flex items-center gap-3"><span className="section-icon"><ParkingSquare size={18}/></span><div><h2>Espacios del parqueadero</h2><p>{admin?'Seleccione un espacio y luego su nueva posición.':'Seleccione un espacio para ver sus datos.'}</p></div></div><div className="legend"><span className="legend-item"><i className="legend-swatch sw-free"/>Disponible</span><span className="legend-item"><i className="legend-swatch sw-used"/>Ocupado</span><span className="legend-item"><i className="legend-swatch sw-off"/>Fuera de servicio</span></div></div>
        {admin&&<div className="admin-banner"><MousePointerClick size={17}/>{selected?`Moviendo ${selected.code}: elija la nueva posición en el plano.`:'Modo administración: seleccione un espacio para moverlo o cambiar su estado.'}</div>}
        {spaces.length===0?<div className="p-12 text-center"><ParkingSquare className="mx-auto text-[var(--blue)]" size={40}/><h3 className="mt-3 font-bold">Aún no hay espacios</h3><p className="mt-2 text-sm text-slate-500">Active la administración para crear el primero.</p></div>
        :<div className="lot-scroll"><div className="lot" style={{minWidth:Math.max(640,cols*96+40)}}>
          <div className="lot-gates"><div className="gate gate-in"><ArrowDownToLine size={17}/>ENTRADA<span className="gate-arm ml-1"/></div><Lane/><div className="gate gate-out"><span className="gate-arm mr-1"/>SALIDA<ArrowUpFromLine size={17}/></div></div>
          {Array.from({length:rows},(_,r)=><div key={r}>
            <div className={`stall-row ${r%2===0?'stall-row-down':'stall-row-up'}`} style={{gridTemplateColumns:`repeat(${cols},minmax(88px,1fr))`}}>{Array.from({length:cols},(_,c)=>{const s=positions.get(`${r}-${c}`);const isSelected=!!s&&selected?.id===s.id;return <button key={c} onClick={()=>choose(r,c)} aria-pressed={isSelected} aria-label={s?`${s.code}: ${statusLabel(s)}${s.plate?` · ${s.plate}`:''}`:`Posición vacía fila ${r+1}, columna ${c+1}`} title={s?`${s.code} · ${statusLabel(s)}${s.plate?` · ${s.plate}`:''}`:undefined} className={`stall ${stallTone(s)} ${isSelected?'stall-selected':''} ${admin&&selected&&!isSelected?'stall-target':''}`}><StallContent space={s} emptyNote={admin?'Mover aquí':''}/></button>})}</div>
            {r<rows-1&&<Lane reverse={r%2===1}/>}
          </div>)}
          <div className="lot-curb"/>
        </div></div>}
      </section>

      <aside className="space-y-4">
        <div className="panel overflow-hidden"><div className="panel-heading"><h2>Detalle del espacio</h2></div><div className="p-5">{active?<div className="space-y-4 text-sm">
          <div className="space-sign"><span className="space-sign-p">P</span><div><strong>{active.code}</strong><div className="mt-1"><span className={`badge ${active.status==='disponible'?'badge-green':active.status==='ocupado'?'badge-amber':'badge-gray'}`}>{active.status==='fuera_servicio'?'fuera de servicio':active.status}</span></div></div></div>
          {active.plate&&<div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><span className="result-label">Vehículo</span><div className="mt-2"><span className="plate-chip plate-chip-lg">{active.plate}</span></div><div className="detail-row mt-2"><span>Ingreso</span><strong>{formatDate(active.entry_at)}</strong></div><div className="detail-row !border-0 !pb-0"><span className="flex items-center gap-1.5"><Timer size={15}/>Permanencia</span><strong>{duration(Math.max(0,(Date.now()-new Date(active.entry_at!).getTime())/1000))}</strong></div></div>}
          {!active.plate&&<p className="text-slate-500">{active.status==='disponible'?'Espacio libre y listo para recibir un vehículo.':'Este espacio no recibe vehículos por ahora.'}</p>}
          {admin&&active.status!=='ocupado'&&<button className="btn btn-light w-full" onClick={()=>change(()=>patch(`/espacios/${active.id}`,{out_of_service:!active.out_of_service}),active.out_of_service?'Espacio habilitado':'Espacio fuera de servicio')}>{active.out_of_service?'Habilitar espacio':'Marcar fuera de servicio'}</button>}
        </div>:<div className="py-6 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--blue-soft)] text-[var(--blue)]"><MousePointerClick size={24}/></div><p className="mt-3 text-sm font-semibold text-slate-600">Seleccione un espacio en el plano.</p><p className="mt-1 text-xs text-slate-400">Verá su estado, el vehículo y el tiempo de permanencia.</p></div>}</div></div>
        {admin&&<div className="panel space-y-4 p-5"><h2 className="flex items-center gap-2 font-extrabold"><Settings2 size={18} className="text-[var(--blue)]"/>Administrar plano</h2><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">Filas<input className="input mt-1" type="number" min="1" max="30" value={rows} onChange={e=>setRows(Number(e.target.value))}/></label><label className="text-xs font-semibold text-slate-600">Columnas<input className="input mt-1" type="number" min="1" max="20" value={cols} onChange={e=>setCols(Number(e.target.value))}/></label></div><button className="btn btn-light w-full" onClick={()=>change(()=>patch('/configuracion',{layout_rows:rows,layout_cols:cols}),'Dimensiones guardadas')}>Guardar dimensiones</button><div className="border-t border-slate-100 pt-4"><label className="text-xs font-semibold text-slate-600">Nuevo código</label><input className="input mt-2" value={code} onChange={e=>setCode(e.target.value)} placeholder="B-01"/><button className="btn btn-primary mt-3 w-full" onClick={create}><Plus size={17}/>Crear espacio</button></div></div>}
      </aside>
    </div>}
  </div>
}
