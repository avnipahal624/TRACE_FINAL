# TRACE on Windows

Open PowerShell in the folder that contains `frontend` and `backend`.

## Frontend

```powershell
cd .\frontend
npm install
npx expo start --web --clear
```

If PowerShell is already inside `frontend`, run only:

```powershell
npx expo start --web --clear
```

The correct frontend folder contains `package.json` with:

```json
"web": "expo start --web"
```

## Backend demo mode

Open a second PowerShell window:

```powershell
cd .\backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
Copy-Item .env.example .env
py -m uvicorn server:app --host 0.0.0.0 --port 8000
```

The packaged demo backend uses embedded persistence, so MongoDB is not required for local demo use.

## Demo accounts

- citizen@trace.demo / demo1234
- authority@trace.demo / demo1234
- admin@trace.demo / demo1234

Do not run `npm install` from the archive root; run it from `frontend`, where `package.json` is located.
