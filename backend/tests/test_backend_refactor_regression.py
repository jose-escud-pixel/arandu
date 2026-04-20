"""
Backend Refactoring Regression Test Suite
Tests all API endpoints after monolithic server.py was split into modular route files:
- routes/auth.py - Auth routes (login, me, profile, password, avatar, permisos)
- routes/usuarios.py - User management CRUD
- routes/empresas.py - Contact messages + Empresas CRUD
- routes/presupuestos.py - Presupuestos CRUD + costos
- routes/inventario.py - Categories, Assets, Credentials, History, Reports
- routes/alertas.py - Alerts CRUD + upcoming alerts
- routes/estadisticas.py - Stats, empresa stats, proveedor stats, auditoria

CRITICAL: Route order matters - estadisticas router must be included BEFORE presupuestos router
because /admin/presupuestos/estadisticas would otherwise match the {presupuesto_id} parameter.
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "jose@aranduinformatica.net"
ADMIN_PASSWORD = "secreto2026**"


class TestHealthAndBase:
    """Test health check and base routes"""
    
    def test_health_endpoint(self):
        """GET /api/health - Health check"""
        res = requests.get(f"{BASE_URL}/api/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        data = res.json()
        assert data["status"] == "healthy"
        print("PASS: GET /api/health returns healthy status")
    
    def test_root_endpoint(self):
        """GET /api/ - Root endpoint"""
        res = requests.get(f"{BASE_URL}/api/")
        assert res.status_code == 200, f"Root endpoint failed: {res.text}"
        data = res.json()
        assert "Arandu" in data.get("message", "")
        print("PASS: GET /api/ returns API info")


class TestAuthRoutes:
    """Test auth routes from routes/auth.py"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        yield
    
    def test_01_login_valid_credentials(self):
        """POST /api/auth/login - Login with valid credentials returns token"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert res.status_code == 200, f"Login failed: {res.text}"
        data = res.json()
        
        # Verify token response structure
        assert "access_token" in data, "Response missing access_token"
        assert "user" in data, "Response missing user"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        assert "permisos" in data["user"]
        assert "empresas_asignadas" in data["user"]
        
        print(f"PASS: Login successful, token received for {ADMIN_EMAIL}")
    
    def test_02_login_invalid_credentials(self):
        """POST /api/auth/login - Login with invalid credentials returns 401"""
        res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@email.com",
            "password": "wrongpassword"
        })
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("PASS: Invalid credentials return 401")
    
    def test_03_get_me_with_token(self):
        """GET /api/auth/me - Returns current user info with bearer token"""
        # First login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        # Get me
        res = self.session.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert res.status_code == 200, f"Get me failed: {res.text}"
        data = res.json()
        
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        assert "id" in data
        assert "name" in data
        assert "created_at" in data
        
        print("PASS: GET /api/auth/me returns user info")
    
    def test_04_get_me_without_token(self):
        """GET /api/auth/me - Returns 401/403 without token"""
        res = self.session.get(f"{BASE_URL}/api/auth/me")
        assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"
        print("PASS: GET /api/auth/me without token returns 401/403")
    
    def test_05_update_profile(self):
        """PUT /api/auth/profile - Update profile name/email"""
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        original_name = login_res.json()["user"]["name"]
        
        # Update profile with same name (to avoid breaking things)
        res = self.session.put(f"{BASE_URL}/api/auth/profile", 
            headers={"Authorization": f"Bearer {token}"},
            json={"name": original_name}
        )
        assert res.status_code == 200, f"Update profile failed: {res.text}"
        
        print("PASS: PUT /api/auth/profile works")
    
    def test_06_change_password_wrong_current(self):
        """PUT /api/auth/password - Change password with wrong current password"""
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        # Try to change password with wrong current
        res = self.session.put(f"{BASE_URL}/api/auth/password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": "wrongpassword", "new_password": "newpass123"}
        )
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"
        
        print("PASS: PUT /api/auth/password rejects wrong current password")


class TestEmpresasRoutes:
    """Test empresas routes from routes/empresas.py"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        self.created_empresas = []
        yield
        
        # Cleanup
        for emp_id in self.created_empresas:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/empresas/{emp_id}")
            except:
                pass
    
    def test_01_list_empresas(self):
        """GET /api/admin/empresas - List empresas (should return 2+)"""
        res = self.session.get(f"{BASE_URL}/api/admin/empresas")
        assert res.status_code == 200, f"List empresas failed: {res.text}"
        
        empresas = res.json()
        assert isinstance(empresas, list)
        assert len(empresas) >= 2, f"Expected at least 2 empresas, got {len(empresas)}"
        
        # Verify structure
        for emp in empresas:
            assert "id" in emp
            assert "nombre" in emp
            assert "created_at" in emp
        
        print(f"PASS: GET /api/admin/empresas returns {len(empresas)} empresas")
    
    def test_02_create_empresa(self):
        """POST /api/admin/empresas - Create empresa"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "nombre": f"TEST_Empresa_{unique_id}",
            "ruc": f"TEST-{unique_id}",
            "direccion": "Test Address",
            "telefono": "123456789",
            "email": f"test_{unique_id}@test.com",
            "contacto": "Test Contact",
            "notas": "Test notes"
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/empresas", json=payload)
        assert res.status_code == 200, f"Create empresa failed: {res.text}"
        
        empresa = res.json()
        self.created_empresas.append(empresa["id"])
        
        assert empresa["nombre"] == payload["nombre"]
        assert empresa["ruc"] == payload["ruc"]
        assert "id" in empresa
        assert "created_at" in empresa
        
        print(f"PASS: POST /api/admin/empresas created empresa {empresa['id']}")
        return empresa["id"]
    
    def test_03_get_single_empresa(self):
        """GET /api/admin/empresas/{id} - Get single empresa"""
        # First create one
        unique_id = str(uuid.uuid4())[:8]
        create_res = self.session.post(f"{BASE_URL}/api/admin/empresas", json={
            "nombre": f"TEST_GetSingle_{unique_id}"
        })
        empresa_id = create_res.json()["id"]
        self.created_empresas.append(empresa_id)
        
        # Get it
        res = self.session.get(f"{BASE_URL}/api/admin/empresas/{empresa_id}")
        assert res.status_code == 200, f"Get empresa failed: {res.text}"
        
        empresa = res.json()
        assert empresa["id"] == empresa_id
        assert f"TEST_GetSingle_{unique_id}" in empresa["nombre"]
        
        print(f"PASS: GET /api/admin/empresas/{empresa_id} returns empresa")
    
    def test_04_update_empresa(self):
        """PUT /api/admin/empresas/{id} - Update empresa"""
        # First create one
        unique_id = str(uuid.uuid4())[:8]
        create_res = self.session.post(f"{BASE_URL}/api/admin/empresas", json={
            "nombre": f"TEST_Update_{unique_id}"
        })
        empresa_id = create_res.json()["id"]
        self.created_empresas.append(empresa_id)
        
        # Update it
        res = self.session.put(f"{BASE_URL}/api/admin/empresas/{empresa_id}", json={
            "nombre": f"TEST_Updated_{unique_id}",
            "telefono": "999888777"
        })
        assert res.status_code == 200, f"Update empresa failed: {res.text}"
        
        # Verify update
        get_res = self.session.get(f"{BASE_URL}/api/admin/empresas/{empresa_id}")
        empresa = get_res.json()
        assert f"TEST_Updated_{unique_id}" in empresa["nombre"]
        assert empresa["telefono"] == "999888777"
        
        print(f"PASS: PUT /api/admin/empresas/{empresa_id} updated empresa")
    
    def test_05_delete_empresa(self):
        """DELETE /api/admin/empresas/{id} - Delete empresa"""
        # First create one
        unique_id = str(uuid.uuid4())[:8]
        create_res = self.session.post(f"{BASE_URL}/api/admin/empresas", json={
            "nombre": f"TEST_Delete_{unique_id}"
        })
        empresa_id = create_res.json()["id"]
        
        # Delete it
        res = self.session.delete(f"{BASE_URL}/api/admin/empresas/{empresa_id}")
        assert res.status_code == 200, f"Delete empresa failed: {res.text}"
        
        # Verify deletion
        get_res = self.session.get(f"{BASE_URL}/api/admin/empresas/{empresa_id}")
        assert get_res.status_code == 404
        
        print(f"PASS: DELETE /api/admin/empresas/{empresa_id} deleted empresa")


class TestPresupuestosRoutes:
    """Test presupuestos routes from routes/presupuestos.py"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get first empresa
        empresas_res = self.session.get(f"{BASE_URL}/api/admin/empresas")
        self.empresa_id = empresas_res.json()[0]["id"]
        
        self.created_presupuestos = []
        yield
        
        # Cleanup
        for pres_id in self.created_presupuestos:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/presupuestos/{pres_id}")
            except:
                pass
    
    def test_01_list_presupuestos(self):
        """GET /api/admin/presupuestos - List presupuestos (should return 6+)"""
        res = self.session.get(f"{BASE_URL}/api/admin/presupuestos")
        assert res.status_code == 200, f"List presupuestos failed: {res.text}"
        
        presupuestos = res.json()
        assert isinstance(presupuestos, list)
        assert len(presupuestos) >= 6, f"Expected at least 6 presupuestos, got {len(presupuestos)}"
        
        # Verify structure
        for p in presupuestos:
            assert "id" in p
            assert "numero" in p
            assert "empresa_id" in p
            assert "total" in p
            assert "estado" in p
        
        print(f"PASS: GET /api/admin/presupuestos returns {len(presupuestos)} presupuestos")
    
    def test_02_create_presupuesto(self):
        """POST /api/admin/presupuestos - Create presupuesto"""
        payload = {
            "empresa_id": self.empresa_id,
            "logo_tipo": "arandujar",
            "moneda": "PYG",
            "validez_dias": 15,
            "items": [
                {
                    "descripcion": "Test Item",
                    "cantidad": 1,
                    "costo": 100000,
                    "margen": 20,
                    "precio_unitario": 120000,
                    "subtotal": 120000
                }
            ],
            "observaciones": "Test presupuesto",
            "subtotal": 120000,
            "iva": 0,
            "total": 120000
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/presupuestos", json=payload)
        assert res.status_code == 200, f"Create presupuesto failed: {res.text}"
        
        presupuesto = res.json()
        self.created_presupuestos.append(presupuesto["id"])
        
        assert presupuesto["empresa_id"] == self.empresa_id
        assert presupuesto["total"] == 120000
        assert presupuesto["estado"] == "borrador"
        assert "numero" in presupuesto
        
        print(f"PASS: POST /api/admin/presupuestos created {presupuesto['numero']}")
        return presupuesto["id"]
    
    def test_03_get_single_presupuesto(self):
        """GET /api/admin/presupuestos/{id} - Get single presupuesto"""
        # Create one first
        payload = {
            "empresa_id": self.empresa_id,
            "moneda": "PYG",
            "validez_dias": 15,
            "items": [{"descripcion": "Test", "cantidad": 1, "costo": 50000, "margen": 0, "precio_unitario": 50000, "subtotal": 50000}],
            "subtotal": 50000, "iva": 0, "total": 50000
        }
        create_res = self.session.post(f"{BASE_URL}/api/admin/presupuestos", json=payload)
        presupuesto_id = create_res.json()["id"]
        self.created_presupuestos.append(presupuesto_id)
        
        # Get it
        res = self.session.get(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}")
        assert res.status_code == 200, f"Get presupuesto failed: {res.text}"
        
        presupuesto = res.json()
        assert presupuesto["id"] == presupuesto_id
        assert "empresa_nombre" in presupuesto
        
        print(f"PASS: GET /api/admin/presupuestos/{presupuesto_id} returns presupuesto")
    
    def test_04_change_presupuesto_estado(self):
        """PUT /api/admin/presupuestos/{id}/estado - Change state"""
        # Create one first
        payload = {
            "empresa_id": self.empresa_id,
            "moneda": "PYG",
            "validez_dias": 15,
            "items": [{"descripcion": "Test", "cantidad": 1, "costo": 50000, "margen": 0, "precio_unitario": 50000, "subtotal": 50000}],
            "subtotal": 50000, "iva": 0, "total": 50000
        }
        create_res = self.session.post(f"{BASE_URL}/api/admin/presupuestos", json=payload)
        presupuesto_id = create_res.json()["id"]
        self.created_presupuestos.append(presupuesto_id)
        
        # Change estado
        res = self.session.put(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/estado?estado=enviado")
        assert res.status_code == 200, f"Change estado failed: {res.text}"
        
        # Verify
        get_res = self.session.get(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}")
        assert get_res.json()["estado"] == "enviado"
        
        print(f"PASS: PUT /api/admin/presupuestos/{presupuesto_id}/estado changed to enviado")
    
    def test_05_update_costos_reales(self):
        """PUT /api/admin/presupuestos/{id}/costos - Update real costs"""
        # Create and set to facturado first
        payload = {
            "empresa_id": self.empresa_id,
            "moneda": "PYG",
            "validez_dias": 15,
            "items": [{"descripcion": "Test", "cantidad": 1, "costo": 50000, "margen": 0, "precio_unitario": 60000, "subtotal": 60000}],
            "subtotal": 60000, "iva": 0, "total": 60000
        }
        create_res = self.session.post(f"{BASE_URL}/api/admin/presupuestos", json=payload)
        presupuesto_id = create_res.json()["id"]
        self.created_presupuestos.append(presupuesto_id)
        
        # Set to facturado
        self.session.put(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/estado?estado=facturado")
        
        # Update costos
        costos_payload = {
            "items": [
                {"descripcion": "Test", "cantidad": 1, "costo_estimado": 50000, "costo_real": 45000, "proveedor": "Proveedor A"}
            ],
            "total_costos": 45000,
            "total_facturado": 60000,
            "ganancia": 15000,
            "proveedores_pagos": []
        }
        res = self.session.put(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/costos", json=costos_payload)
        assert res.status_code == 200, f"Update costos failed: {res.text}"
        
        print(f"PASS: PUT /api/admin/presupuestos/{presupuesto_id}/costos updated")


class TestInventarioRoutes:
    """Test inventario routes from routes/inventario.py"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get first empresa
        empresas_res = self.session.get(f"{BASE_URL}/api/admin/empresas")
        self.empresa_id = empresas_res.json()[0]["id"]
        
        self.created_activos = []
        yield
        
        # Cleanup
        for activo_id in self.created_activos:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/activos/{activo_id}")
            except:
                pass
    
    def test_01_list_activos(self):
        """GET /api/admin/activos - List inventory assets (should return 2+)"""
        res = self.session.get(f"{BASE_URL}/api/admin/activos")
        assert res.status_code == 200, f"List activos failed: {res.text}"
        
        activos = res.json()
        assert isinstance(activos, list)
        assert len(activos) >= 2, f"Expected at least 2 activos, got {len(activos)}"
        
        print(f"PASS: GET /api/admin/activos returns {len(activos)} activos")
    
    def test_02_create_activo(self):
        """POST /api/admin/activos - Create asset"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Dispositivos",
            "subtipo": "PC Escritorio",
            "nombre": f"TEST_PC_{unique_id}",
            "descripcion": "Test PC",
            "ubicacion": "Oficina",
            "ip_local": "192.168.1.100",
            "estado": "activo",
            "campos_personalizados": {},
            "activos_asignados": []
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/activos", json=payload)
        assert res.status_code == 200, f"Create activo failed: {res.text}"
        
        activo = res.json()
        self.created_activos.append(activo["id"])
        
        assert activo["nombre"] == payload["nombre"]
        assert activo["categoria"] == "Dispositivos"
        
        print(f"PASS: POST /api/admin/activos created {activo['id']}")
        return activo["id"]
    
    def test_03_get_credenciales(self):
        """GET /api/admin/activos/{id}/credenciales - Get credentials"""
        # Create activo first
        unique_id = str(uuid.uuid4())[:8]
        create_res = self.session.post(f"{BASE_URL}/api/admin/activos", json={
            "empresa_id": self.empresa_id,
            "categoria": "Dispositivos",
            "subtipo": "PC Escritorio",
            "nombre": f"TEST_Cred_{unique_id}",
            "estado": "activo",
            "campos_personalizados": {},
            "activos_asignados": []
        })
        activo_id = create_res.json()["id"]
        self.created_activos.append(activo_id)
        
        # Get credentials
        res = self.session.get(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales")
        assert res.status_code == 200, f"Get credenciales failed: {res.text}"
        
        creds = res.json()
        assert isinstance(creds, list)
        
        print(f"PASS: GET /api/admin/activos/{activo_id}/credenciales returns {len(creds)} credentials")
    
    def test_04_create_credencial(self):
        """POST /api/admin/activos/{id}/credenciales - Create credential"""
        # Create activo first
        unique_id = str(uuid.uuid4())[:8]
        create_res = self.session.post(f"{BASE_URL}/api/admin/activos", json={
            "empresa_id": self.empresa_id,
            "categoria": "Dispositivos",
            "subtipo": "PC Escritorio",
            "nombre": f"TEST_CredCreate_{unique_id}",
            "estado": "activo",
            "campos_personalizados": {},
            "activos_asignados": []
        })
        activo_id = create_res.json()["id"]
        self.created_activos.append(activo_id)
        
        # Create credential
        cred_payload = {
            "activo_id": activo_id,
            "tipo_acceso": "RDP",
            "usuario": "admin",
            "password": "test123",
            "url_acceso": "192.168.1.100:3389",
            "observaciones": "Test credential"
        }
        res = self.session.post(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", json=cred_payload)
        assert res.status_code == 200, f"Create credencial failed: {res.text}"
        
        cred = res.json()
        assert cred["tipo_acceso"] == "RDP"
        assert cred["usuario"] == "admin"
        
        print(f"PASS: POST /api/admin/activos/{activo_id}/credenciales created credential")
    
    def test_05_get_categorias(self):
        """GET /api/admin/categorias - Get categories (should return 4)"""
        res = self.session.get(f"{BASE_URL}/api/admin/categorias")
        assert res.status_code == 200, f"Get categorias failed: {res.text}"
        
        categorias = res.json()
        assert isinstance(categorias, list)
        assert len(categorias) >= 4, f"Expected at least 4 categories, got {len(categorias)}"
        
        cat_names = [c["nombre"] for c in categorias]
        assert "Servidores" in cat_names
        assert "Dispositivos" in cat_names
        assert "Cuentas de Acceso" in cat_names
        assert "Dominios y Servicios" in cat_names
        
        print(f"PASS: GET /api/admin/categorias returns {len(categorias)} categories")


class TestAlertasRoutes:
    """Test alertas routes from routes/alertas.py"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get first empresa
        empresas_res = self.session.get(f"{BASE_URL}/api/admin/empresas")
        self.empresa_id = empresas_res.json()[0]["id"]
        
        self.created_alertas = []
        yield
        
        # Cleanup
        for alerta_id in self.created_alertas:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/alertas/{alerta_id}")
            except:
                pass
    
    def test_01_list_alertas(self):
        """GET /api/admin/alertas - List alerts"""
        res = self.session.get(f"{BASE_URL}/api/admin/alertas")
        assert res.status_code == 200, f"List alertas failed: {res.text}"
        
        alertas = res.json()
        assert isinstance(alertas, list)
        
        print(f"PASS: GET /api/admin/alertas returns {len(alertas)} alerts")
    
    def test_02_create_alerta(self):
        """POST /api/admin/alertas - Create alert"""
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        payload = {
            "empresa_id": self.empresa_id,
            "tipo": "vencimiento",
            "nombre": f"TEST_Alerta_{uuid.uuid4().hex[:8]}",
            "descripcion": "Test alert",
            "fecha_vencimiento": future_date,
            "notificar_dias": 15
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/alertas", json=payload)
        assert res.status_code == 200, f"Create alerta failed: {res.text}"
        
        alerta = res.json()
        self.created_alertas.append(alerta["id"])
        
        assert alerta["nombre"] == payload["nombre"]
        assert alerta["estado"] == "activa"
        
        print(f"PASS: POST /api/admin/alertas created alert {alerta['id']}")
    
    def test_03_get_alertas_proximas(self):
        """GET /api/admin/alertas/proximas - Upcoming alerts"""
        res = self.session.get(f"{BASE_URL}/api/admin/alertas/proximas")
        assert res.status_code == 200, f"Get alertas proximas failed: {res.text}"
        
        alertas = res.json()
        assert isinstance(alertas, list)
        
        print(f"PASS: GET /api/admin/alertas/proximas returns {len(alertas)} upcoming alerts")


class TestEstadisticasRoutes:
    """Test estadisticas routes from routes/estadisticas.py
    CRITICAL: This router must be included BEFORE presupuestos router
    """
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        yield
    
    def test_01_get_stats(self):
        """GET /api/admin/stats - Dashboard stats"""
        res = self.session.get(f"{BASE_URL}/api/admin/stats")
        assert res.status_code == 200, f"Get stats failed: {res.text}"
        
        stats = res.json()
        assert "total_empresas" in stats
        assert "total_presupuestos" in stats
        assert "total_messages" in stats
        
        print(f"PASS: GET /api/admin/stats returns dashboard stats")
    
    def test_02_get_presupuesto_estadisticas(self):
        """GET /api/admin/presupuestos/estadisticas - Presupuesto stats
        CRITICAL: This tests the route order - estadisticas router must be before presupuestos
        """
        res = self.session.get(f"{BASE_URL}/api/admin/presupuestos/estadisticas")
        assert res.status_code == 200, f"Get presupuesto estadisticas failed: {res.text}"
        
        stats = res.json()
        assert "total" in stats
        assert "por_estado" in stats
        
        print(f"PASS: GET /api/admin/presupuestos/estadisticas returns stats (route order correct)")
    
    def test_03_get_estadisticas_empresas(self):
        """GET /api/admin/estadisticas/empresas - Stats by empresa"""
        res = self.session.get(f"{BASE_URL}/api/admin/estadisticas/empresas")
        assert res.status_code == 200, f"Get estadisticas empresas failed: {res.text}"
        
        stats = res.json()
        assert isinstance(stats, list)
        
        print(f"PASS: GET /api/admin/estadisticas/empresas returns {len(stats)} empresa stats")
    
    def test_04_get_estadisticas_proveedores(self):
        """GET /api/admin/estadisticas/proveedores - Provider stats"""
        res = self.session.get(f"{BASE_URL}/api/admin/estadisticas/proveedores")
        assert res.status_code == 200, f"Get estadisticas proveedores failed: {res.text}"
        
        stats = res.json()
        assert isinstance(stats, list)
        
        print(f"PASS: GET /api/admin/estadisticas/proveedores returns {len(stats)} provider stats")
    
    def test_05_get_auditoria(self):
        """GET /api/admin/auditoria - Audit logs"""
        res = self.session.get(f"{BASE_URL}/api/admin/auditoria")
        assert res.status_code == 200, f"Get auditoria failed: {res.text}"
        
        logs = res.json()
        assert isinstance(logs, list)
        
        print(f"PASS: GET /api/admin/auditoria returns {len(logs)} audit logs")


class TestUsuariosRoutes:
    """Test usuarios routes from routes/usuarios.py"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        self.created_users = []
        yield
        
        # Cleanup
        for user_id in self.created_users:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/usuarios/{user_id}")
            except:
                pass
    
    def test_01_list_usuarios(self):
        """GET /api/admin/usuarios - List users (admin only)"""
        res = self.session.get(f"{BASE_URL}/api/admin/usuarios")
        assert res.status_code == 200, f"List usuarios failed: {res.text}"
        
        users = res.json()
        assert isinstance(users, list)
        assert len(users) >= 1  # At least admin user
        
        print(f"PASS: GET /api/admin/usuarios returns {len(users)} users")
    
    def test_02_get_permisos_disponibles(self):
        """GET /api/admin/permisos-disponibles - Available permissions"""
        res = self.session.get(f"{BASE_URL}/api/admin/permisos-disponibles")
        assert res.status_code == 200, f"Get permisos failed: {res.text}"
        
        permisos = res.json()
        assert "empresas" in permisos
        assert "presupuestos" in permisos
        assert "inventario" in permisos
        
        print(f"PASS: GET /api/admin/permisos-disponibles returns permissions matrix")


class TestReportesRoutes:
    """Test reportes routes from routes/inventario.py"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        yield
    
    def test_01_export_inventario_report(self):
        """GET /api/admin/reportes/inventario - Export inventory report"""
        res = self.session.get(f"{BASE_URL}/api/admin/reportes/inventario")
        assert res.status_code == 200, f"Export inventario failed: {res.text}"
        
        report = res.json()
        assert isinstance(report, list)
        
        print(f"PASS: GET /api/admin/reportes/inventario returns {len(report)} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
