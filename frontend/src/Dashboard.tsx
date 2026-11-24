import {useEffect,useState} from 'react'
import {NavLink} from 'react-router-dom'
import {ArrowDownLeft,ArrowRight,ArrowUpRight,CarFront,Clock3,ParkingSquare,ScanLine,TrendingUp} from 'lucide-react'
import {api,formatDate} from './api'
import type {Summary,Recognition} from './types'
import {StallContent,stallTone} from './ParkingVisuals'

function Kpi({label,value,icon:Icon,detail,tone}:{label:string;value:string|number;icon:typeof CarFront;detail:string;tone:string}){return <div className="kpi"><div className="flex items-center gap-2.5"><span className={`kpi-icon ${tone}`}><Icon size={17}/></span><span className="kpi-label">{label}</span></div><strong className="kpi-value">{value}</strong><span className="kpi-detail">{detail}</span></div>}
function Gauge({value}:{value:number}){const r=54,c=2*Math.PI*r,pct=Math.min(100,Math.max(0,value));return <svg className="gauge h-[140px] w-[140px] flex-none" viewBox="0 0 140 140" role="img" aria-label={`Ocupación ${pct}%`}><circle cx="70" cy="70" r={r} fill="none" stroke="#ffffff14" strokeWidth="14"/><circle cx="70" cy="70" r={r} fill="none" stroke="var(--yellow)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${c*pct/100} ${c}`} transform="rotate(-90 70 70)" style={{transition:'stroke-dasharray .6s'}}/><text x="70" y="72" textAnchor="middle" fill="#fff" fontSize="34" fontWeight="800">{pct}%</text><text x="70" y="94" textAnchor="middle" fill="#8ea2ab" fontSize="12" fontWeight="700" letterSpacing="2">OCUPACIÓN</text></svg>}
export default function Dashboard(){const [recognition,setRecognition]=useState<Recognition|null>(null);const [data,setData]=useState<Summary|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);useEffect(()=>{api<Recognition>('/reconocimiento/estado').then(setRecognition).catch(()=>{});api<Summary>('/dashboard/resumen').then(setData).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[])
  const usable=data?Math.max(1,data.total):1
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Vista general</p><h1 className="page-title">Centro de operaciones</h1><p className="page-subtitle">Estado del parqueadero y actividad registrada en tiempo real.</p></div><NavLink className="btn btn-primary" to="/control"><ScanLine size={18}/>Control de acceso<ArrowRight size={16}/></NavLink></div>
    {loading?<div className="panel p-8">Cargando información…</div>:error?<div className="notice notice-error">{error}</div>:data&&<>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="ops-hero">
          <div className="relative flex flex-wrap items-center gap-7 p-6 sm:p-7">
            <Gauge value={data.occupancy_percent}/>
            <div className="min-w-[240px] flex-1">
              <p className="ops-hero-label">Capacidad operativa</p>
              <p className="mt-2 flex items-baseline gap-3"><span className="ops-big text-[#5fe0a0]">{data.available}</span><span className="text-lg font-semibold text-slate-300">espacios libres de {data.total}</span></p>
              <div className="cap-bar mt-5 bg-white/10"><i style={{width:`${data.available/usable*100}%`,background:'#2fbf7d'}}/><i style={{width:`${data.occupied/usable*100}%`,background:'var(--orange)'}}/><i style={{width:`${data.out_of_service/usable*100}%`,background:'#6b7d86'}}/></div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-300"><span><span className="legend-dot bg-[#2fbf7d]"/>Disponible <b className="text-white">{data.available}</b></span><span><span className="legend-dot bg-[var(--orange)]"/>Ocupado <b className="text-white">{data.occupied}</b></span><span><span className="legend-dot bg-[#6b7d86]"/>Fuera de servicio <b className="text-white">{data.out_of_service}</b></span></div>
            </div>
          </div>
          <div className="relative grid grid-cols-2 border-t border-white/10 md:grid-cols-4">
            <Kpi label="Espacios disponibles" value={data.available} icon={ParkingSquare} detail={`de ${data.total} espacios en total`} tone="tone-teal"/>
            <Kpi label="Vehículos activos" value={data.inside} icon={CarFront} detail="Dentro del parqueadero" tone="tone-blue"/>
            <Kpi label="Entradas de hoy" value={data.entries_today} icon={ArrowDownLeft} detail="Desde las 00:00 · Colombia" tone="tone-violet"/>
            <Kpi label="Salidas de hoy" value={data.exits_today} icon={ArrowUpRight} detail="Operaciones completadas" tone="tone-amber"/>
          </div>
          <div className="ops-lane"/>
        </section>
        <section className="cta-card"><div className="barrier"/><span className="cta-sign mt-4"><ScanLine size={28}/></span><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-[#5c4700]">Acción rápida</p><h2 className="mt-2 text-[1.75rem] font-extrabold leading-tight">Cada vehículo, un movimiento claro.</h2><p className="mt-3 text-[.95rem] leading-6 text-[#4a3c08]">Verifique la placa y confirme el ingreso o la salida correspondiente.</p><NavLink className="btn btn-dark relative z-10 mt-auto self-start" to="/control" style={{marginTop:'1.5rem'}}>Abrir control de acceso<ArrowRight size={17}/></NavLink></section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
        <section className="panel overflow-hidden"><div className="panel-heading justify-between"><div className="flex items-center gap-3"><span className="section-icon"><ParkingSquare size={18}/></span><div><h2>Mapa de espacios</h2><p>Estado actual de los primeros espacios</p></div></div><NavLink className="link-btn" to="/espacios">Ver todos <ArrowRight size={15}/></NavLink></div>
          <div className="p-5"><div className="mini-lot"><div className="stall-row stall-row-down grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">{data.spaces.slice(0,12).map(space=><div key={space.id} title={`${space.code}: ${space.status==='fuera_servicio'?'fuera de servicio':space.status}${space.plate?` · ${space.plate}`:''}`} className={`stall ${stallTone(space)} [&:nth-child(6n)]:border-r-[3px]`}><StallContent space={space}/></div>)}</div></div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-slate-500"><span><span className="legend-dot bg-[var(--green)]"/>Disponible</span><span><span className="legend-dot bg-[var(--orange)]"/>Ocupado</span><span><span className="legend-dot bg-slate-400"/>Fuera de servicio</span></div></div></section>
        <section className="panel overflow-hidden"><div className="panel-heading"><span className="section-icon"><Clock3 size={18}/></span><div><h2>Actividad reciente</h2><p>Últimos vehículos registrados</p></div></div><div className="divide-y divide-slate-100 px-5">{data.recent.length?data.recent.map(item=><div key={item.id} className="timeline-item"><span className={`timeline-icon ${item.status==='activo'?'tone-in':'tone-out'}`}>{item.status==='activo'?<ArrowDownLeft size={17}/>:<ArrowUpRight size={17}/>}</span><div className="min-w-0 flex-1"><span className="plate-chip">{item.plate}</span><p className="mt-1 truncate text-xs text-slate-500"><span className="font-semibold text-slate-600">{item.space_code}</span> · {formatDate(item.entry_at)}</p></div><span className={`badge ${item.status==='activo'?'badge-amber':'badge-green'}`}>{item.status==='activo'?'Dentro':'Finalizado'}</span></div>):<div className="py-10 text-center text-sm text-slate-500"><Clock3 className="mx-auto mb-2 text-slate-300" size={28}/>Aún no hay movimientos.</div>}</div></section>
      </div>
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${recognition?.available?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-slate-200 bg-white text-slate-500'}`}><TrendingUp size={14}/>{!recognition?'Estado del reconocimiento no disponible':recognition.available?'Reconocimiento automático disponible':'Reconocimiento automático no disponible. Continúe con la placa manual.'}</div>
    </>}
  </div>}
