# Parqueader Jimenez

Simulador web de parqueadero inteligente. React + TypeScript + Vite + Tailwind CSS; FastAPI + SQLAlchemy + Alembic; PostgreSQL. El reconocimiento usa el detector YOLO26n y el modelo exportado PP-OCRv5 Mobile presentes en `backend/models/`. El operador revisa y confirma cada movimiento; el ingreso manual sigue disponible.

El frontend declara UTF-8 en HTML; los archivos fuente y respuestas JSON usan UTF-8. Docker inicializa PostgreSQL con codificación UTF8. Si utiliza una base existente, compruebe su codificación con `SHOW server_encoding;`.

## Inicio rápido con Docker (PowerShell)

Desde esta carpeta, inicie Docker Desktop y ejecute:

```powershell
docker compose up --build -d
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173`. La API y Swagger estarán en `http://localhost:8000/docs`. Docker expone PostgreSQL en el puerto local `5433` para evitar conflictos con instalaciones existentes, aplica las migraciones y carga un plano inicial de 30 espacios distribuidos en cinco filas y seis columnas. El volumen `pgdata` conserva los datos.

## Inicio sin Docker

Instale PostgreSQL 16 o superior y cree un usuario `parqueadero` con contraseña `parqueadero` y una base `parqueadero`, o ajuste `DATABASE_URL` en `.env` siguiendo `.env.example`. En PowerShell:

```powershell
Copy-Item .env.example .env
cd backend
py -3.11 -m venv .venv-ai
.\.venv-ai\Scripts\Activate.ps1
pip install -r requirements.txt
pip install --index-url https://download.pytorch.org/whl/cpu torch==2.15.0+cpu torchvision==0.29.2+cpu
pip install -r requirements-ai.txt
pip uninstall -y opencv-python opencv-python-headless nvidia-ml-py
pip install --force-reinstall --no-deps opencv-contrib-python==4.10.0.84
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

En otra terminal:

```powershell
cd frontend
npm install
npm run dev
```

Use Python 3.11 para la instalación local con PaddleOCR. El frontend usa el proxy de Vite para `/api`; para otro servidor defina `VITE_API_URL`.

## Uso

1. Entre a **Control de acceso** y capture una fotografía, suba una imagen o escriba la placa. El sistema consulta el ingreso vigente y propone **ingreso** o **salida**. Revise la placa y confirme; la operación vuelve a validar el estado antes de registrarse.
2. Para un ingreso, seleccione cualquier espacio disponible. El reconocimiento de placa no identifica el tipo de vehículo.
3. Consulte **Vehículos dentro** y el **Plano de espacios**. En modo administración puede crear espacios, modificar el tamaño del plano e intercambiar posiciones.
4. **Historial** permite filtrar, paginar y exportar CSV.

Las imágenes de cámara o archivo se envían a `/api/reconocimiento/procesar` solo al pulsar **Reconocer placa**. El navegador necesita `localhost` o HTTPS para la cámara. Sin modelos, la API responde 503 y el operador puede escribir la placa; nunca se genera una predicción ficticia. Las imágenes no se guardan.

## Modelos de reconocimiento

- YOLO: `backend/models/yolo/best.pt`, configurable con `YOLO_MODEL_PATH`.
- PaddleOCR: directorio exportado `backend/models/ocr/modelo_ocr_exportado/`, configurable con `OCR_MODEL_PATH`. Debe contener `inference.json`, `inference.pdiparams` e `inference.yml`. Un checkpoint `best_accuracy.pdparams` por sí solo no es suficiente.
- La instalación con Docker incorpora `backend/requirements-ai.txt`. En instalación local use el entorno `.venv-ai` de Python 3.11. El entorno anterior `.venv` creado con Python 3.14 no incluye PaddlePaddle. El servicio carga YOLO y el módulo independiente `TextRecognition` de PaddleOCR bajo demanda; muestra varias placas candidatas para selección y corrección.
- La imagen usa PyTorch y PaddlePaddle para CPU. Conserva únicamente `opencv-contrib-python` porque PaddleX comprueba específicamente esa distribución al cargar el modelo exportado. El Dockerfile elimina las otras distribuciones de OpenCV después de resolver dependencias. Los modelos se montan como archivos de solo lectura y quedan fuera de la imagen.
- `pip check` señalará dos dependencias declaradas por Ultralytics: `opencv-python`, reemplazada funcionalmente por `opencv-contrib-python`, y `nvidia-ml-py`, destinada al monitoreo de GPU. Ambas se excluyen deliberadamente de la imagen CPU; la carga de los modelos y una inferencia real se verificaron dentro del contenedor.

Para verificar la carga local desde `backend`:

```powershell
.\.venv-ai\Scripts\python.exe -c "from app.ai import load_models, state; load_models(); print(state())"
```

Los pesos están excluidos de Git. No hay entrenamiento ni datasets en este repositorio.

## Pruebas

```powershell
cd frontend
npm run build
cd ..\backend
pip install -r requirements-dev.txt
.\.venv-ai\Scripts\python.exe -m pytest -q
```

Las pruebas de integración requieren una base PostgreSQL **exclusiva para pruebas**, con `TEST_DATABASE_URL` configurada. Por seguridad, sin esa variable se omiten. Para revisar migraciones use `alembic upgrade head` sobre una base nueva. El backend usa índices únicos parciales y bloqueos transaccionales para prevenir sesiones activas duplicadas.
