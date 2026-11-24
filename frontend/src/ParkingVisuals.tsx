// Presentational pieces for the parking map. No data fetching or state: they only render a Space.
import {Ban,ChevronLeft,ChevronRight} from 'lucide-react'
import type {Space} from './types'

const CAR_COLORS=['#d9dee2','#2e3d47','#7d8b94','#b5412f','#2b5d9b','#eef0f2','#56626a','#8a2e38','#3f6b4f']
function carColor(seed:string){let h=0;for(const ch of seed)h=(h*31+ch.charCodeAt(0))>>>0;return CAR_COLORS[h%CAR_COLORS.length]}

/** Top-down car silhouette; the front points up. */
export function CarTop({seed,className='stall-car'}:{seed:string;className?:string}){
  const body=carColor(seed)
  return <svg className={className} viewBox="0 0 44 78" aria-hidden="true">
    <rect x="1" y="21" width="5" height="7" rx="2" fill={body}/><rect x="38" y="21" width="5" height="7" rx="2" fill={body}/>
    <rect x="4" y="2" width="36" height="74" rx="12" fill={body}/>
    <rect x="4" y="2" width="36" height="74" rx="12" fill="url(#car-shade)"/>
    <rect x="8" y="17" width="28" height="13" rx="4" fill="#0f1a20" opacity=".82"/>
    <rect x="9" y="31" width="26" height="22" rx="3" fill="#fff" opacity=".1"/>
    <rect x="9" y="55" width="26" height="9" rx="3.5" fill="#0f1a20" opacity=".75"/>
    <rect x="8" y="4" width="8" height="3.5" rx="1.75" fill="#fff7c7"/><rect x="28" y="4" width="8" height="3.5" rx="1.75" fill="#fff7c7"/>
    <rect x="8" y="70.5" width="7" height="3" rx="1.5" fill="#ff5a4e"/><rect x="29" y="70.5" width="7" height="3" rx="1.5" fill="#ff5a4e"/>
    <defs><linearGradient id="car-shade" x1="0" x2="1"><stop offset="0" stopColor="#000" stopOpacity=".18"/><stop offset=".5" stopColor="#fff" stopOpacity=".12"/><stop offset="1" stopColor="#000" stopOpacity=".18"/></linearGradient></defs>
  </svg>
}

export const stallTone=(space?:Space)=>!space?'stall-empty':space.status==='disponible'?'stall-free':space.status==='ocupado'?'stall-used':'stall-off'
export const statusLabel=(space:Space)=>space.status==='disponible'?'Disponible':space.status==='ocupado'?'Ocupado':'Fuera de servicio'

/** Inner content of a parking stall: painted code, vehicle or availability mark. */
export function StallContent({space,emptyNote=''}:{space?:Space;emptyNote?:string}){
  if(!space)return <><span className="stall-code">—</span><span className="stall-note text-white/50">{emptyNote}</span><span/></>
  return <>
    <span className="stall-code">{space.code}</span>
    {space.status==='ocupado'?<CarTop seed={space.plate||space.code}/>:space.status==='disponible'?<span className="stall-mark">P</span>:<Ban size={26} className="text-white/60"/>}
    {space.plate?<span className="plate-chip">{space.plate}</span>:<span className="stall-note">{space.status==='disponible'?'Disponible':'Fuera de servicio'}</span>}
    <span className="stall-led"/>
  </>
}

/** Driving lane with dashed center line and flow arrows. */
export function Lane({reverse=false,label='Carril de circulación'}:{reverse?:boolean;label?:string}){
  const Arrow=reverse?ChevronLeft:ChevronRight
  return <div className="lane" aria-hidden="true"><div className="lane-arrows">{Array.from({length:6},(_,i)=><Arrow key={i} size={20} strokeWidth={3}/>)}</div><span className="lane-label">{reverse?'← ':''}{label}{reverse?'':' →'}</span></div>
}
