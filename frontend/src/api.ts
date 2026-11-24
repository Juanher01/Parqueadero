const base=import.meta.env.VITE_API_URL || ''
export async function api<T>(path:string, options:RequestInit={}):Promise<T>{
  let response:Response
  try{response=await fetch(base+'/api'+path,{...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...options.headers}})}
  catch{throw new Error('No hay conexión con el sistema. Revise la red e inténtelo de nuevo.')}
  if(!response.ok){
    if(response.status===503)throw new Error('Reconocimiento automático no disponible. Puede ingresar la placa manualmente.')
    if(response.status===413)throw new Error('La imagen supera el tamaño permitido de 8 MB.')
    if(response.status===415)throw new Error('Seleccione una imagen JPEG, PNG o WebP.')
    let detail=''
    try{const data=await response.json();if(typeof data.detail==='string')detail=data.detail}catch{}
    if(response.status===409){
      if(detail.includes('estado de la placa'))throw new Error('El estado del vehículo cambió. Vuelva a verificar la placa antes de confirmar.')
      if(detail.includes('entrada activa'))throw new Error('Este vehículo ya se encuentra dentro del parqueadero.')
      if(detail.includes('espacios disponibles'))throw new Error('No hay espacios disponibles para registrar el ingreso.')
      if(detail.includes('espacio ocupado'))throw new Error('Primero registre la salida del vehículo que ocupa este espacio.')
      if(detail.includes('posición')||detail.includes('código'))throw new Error('El código o la posición ya está en uso.')
    }
    if(response.status===404)throw new Error('No se encontró un ingreso vigente para esta placa.')
    if(response.status===422)throw new Error(detail.includes('plano')?detail:'Revise los datos ingresados e inténtelo de nuevo.')
    throw new Error('No fue posible completar la operación. Inténtelo de nuevo.')
  }
  return response.json()
}
export const post=<T,>(path:string,data:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(data)})
export const patch=<T,>(path:string,data:unknown)=>api<T>(path,{method:'PATCH',body:JSON.stringify(data)})
export const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat('es-CO',{timeZone:'America/Bogota',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—'
export const duration=(seconds:number)=>{const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60);return h?`${h} h ${m} min`:`${m} min`}
