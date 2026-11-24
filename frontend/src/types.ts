export type Space={id:number;code:string;row_index:number;col_index:number;status:'disponible'|'ocupado'|'fuera_servicio';out_of_service:boolean;plate:string|null;entry_at:string|null}
export type Parking={id:number;plate:string;space_id:number;space_code:string;entry_at:string;exit_at:string|null;duration_seconds:number|null;status:'activo'|'finalizado'}
export type Summary={total:number;available:number;occupied:number;out_of_service:number;occupancy_percent:number;inside:number;entries_today:number;exits_today:number;recent:Parking[];spaces:Space[]}
export type Recognition={yolo_file:boolean;ocr_export:boolean;yolo_loaded:boolean;ocr_loaded:boolean;available:boolean}
