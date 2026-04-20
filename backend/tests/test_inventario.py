"""
Test suite for Inventario Técnico (Technical Inventory) feature
Tests: Activos CRUD, Credenciales CRUD, Categorias CRUD, Historial, Reportes
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://inventario-tech-ui.preview.emergentagent.com').rstrip('/')

# Test credentials
ADMIN_EMAIL = "jose@aranduinformatica.net"
ADMIN_PASSWORD = "secreto2026**"


class TestInventarioBackend:
    """Inventario Técnico backend API tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, admin_token):
        """Headers with auth token"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def test_empresa_id(self, auth_headers):
        """Get or create a test empresa for activos"""
        # First try to get existing empresas
        response = requests.get(f"{BASE_URL}/api/admin/empresas", headers=auth_headers)
        assert response.status_code == 200
        empresas = response.json()
        if empresas:
            return empresas[0]["id"]
        
        # Create a test empresa if none exist
        response = requests.post(f"{BASE_URL}/api/admin/empresas", headers=auth_headers, json={
            "nombre": f"TEST_Empresa_Inventario_{uuid.uuid4().hex[:6]}",
            "ruc": "80012345-6",
            "direccion": "Test Address",
            "telefono": "0981123456"
        })
        assert response.status_code == 200
        return response.json()["id"]
    
    # ==================== HEALTH & AUTH ====================
    
    def test_health_endpoint(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
        print("✓ Health endpoint working")
    
    def test_admin_login(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful: {data['user']['name']}")
    
    # ==================== CATEGORIAS ====================
    
    def test_get_categorias(self, auth_headers):
        """Test GET /api/admin/categorias returns categories"""
        response = requests.get(f"{BASE_URL}/api/admin/categorias", headers=auth_headers)
        assert response.status_code == 200
        categorias = response.json()
        assert isinstance(categorias, list)
        assert len(categorias) > 0, "Should have default categories"
        # Check structure
        cat = categorias[0]
        assert "id" in cat
        assert "nombre" in cat
        assert "subtipos" in cat
        print(f"✓ GET categorias: {len(categorias)} categories found")
        # Print category names
        cat_names = [c["nombre"] for c in categorias]
        print(f"  Categories: {', '.join(cat_names)}")
    
    def test_create_categoria(self, auth_headers):
        """Test POST /api/admin/categorias creates category"""
        unique_name = f"TEST_Cat_{uuid.uuid4().hex[:6]}"
        response = requests.post(f"{BASE_URL}/api/admin/categorias", headers=auth_headers, json={
            "nombre": unique_name,
            "subtipos": ["Subtipo1", "Subtipo2"]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["nombre"] == unique_name
        assert "Subtipo1" in data["subtipos"]
        print(f"✓ Created category: {unique_name}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/categorias/{data['id']}", headers=auth_headers)
    
    def test_update_categoria(self, auth_headers):
        """Test PUT /api/admin/categorias/{id} updates category"""
        # Create
        unique_name = f"TEST_Cat_Update_{uuid.uuid4().hex[:6]}"
        create_resp = requests.post(f"{BASE_URL}/api/admin/categorias", headers=auth_headers, json={
            "nombre": unique_name,
            "subtipos": []
        })
        assert create_resp.status_code == 200
        cat_id = create_resp.json()["id"]
        
        # Update
        updated_name = f"{unique_name}_Updated"
        update_resp = requests.put(f"{BASE_URL}/api/admin/categorias/{cat_id}", headers=auth_headers, json={
            "nombre": updated_name,
            "subtipos": ["NewSubtipo"]
        })
        assert update_resp.status_code == 200
        print(f"✓ Updated category: {updated_name}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/categorias/{cat_id}", headers=auth_headers)
    
    def test_delete_categoria(self, auth_headers):
        """Test DELETE /api/admin/categorias/{id} deletes category"""
        # Create
        unique_name = f"TEST_Cat_Delete_{uuid.uuid4().hex[:6]}"
        create_resp = requests.post(f"{BASE_URL}/api/admin/categorias", headers=auth_headers, json={
            "nombre": unique_name,
            "subtipos": []
        })
        assert create_resp.status_code == 200
        cat_id = create_resp.json()["id"]
        
        # Delete
        delete_resp = requests.delete(f"{BASE_URL}/api/admin/categorias/{cat_id}", headers=auth_headers)
        assert delete_resp.status_code == 200
        print(f"✓ Deleted category: {unique_name}")
    
    # ==================== ACTIVOS CRUD ====================
    
    def test_get_activos(self, auth_headers):
        """Test GET /api/admin/activos returns activos list"""
        response = requests.get(f"{BASE_URL}/api/admin/activos", headers=auth_headers)
        assert response.status_code == 200
        activos = response.json()
        assert isinstance(activos, list)
        print(f"✓ GET activos: {len(activos)} activos found")
        if activos:
            # Check structure
            activo = activos[0]
            assert "id" in activo
            assert "nombre" in activo
            assert "empresa_id" in activo
            assert "categoria" in activo
            assert "empresa_nombre" in activo
            assert "credenciales_count" in activo
            print(f"  First activo: {activo['nombre']} ({activo['categoria']}) - {activo['empresa_nombre']}")
    
    def test_get_activos_with_filters(self, auth_headers, test_empresa_id):
        """Test GET /api/admin/activos with filters"""
        # Filter by empresa
        response = requests.get(f"{BASE_URL}/api/admin/activos?empresa_id={test_empresa_id}", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ GET activos filtered by empresa_id: {len(response.json())} results")
        
        # Filter by estado
        response = requests.get(f"{BASE_URL}/api/admin/activos?estado=activo", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ GET activos filtered by estado=activo: {len(response.json())} results")
        
        # Search
        response = requests.get(f"{BASE_URL}/api/admin/activos?search=servidor", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ GET activos search 'servidor': {len(response.json())} results")
    
    def test_create_activo(self, auth_headers, test_empresa_id):
        """Test POST /api/admin/activos creates activo"""
        unique_name = f"TEST_Activo_{uuid.uuid4().hex[:6]}"
        payload = {
            "empresa_id": test_empresa_id,
            "categoria": "Servidor",
            "subtipo": "Linux",
            "nombre": unique_name,
            "descripcion": "Test server for inventory testing",
            "ubicacion": "Rack 1",
            "ip_local": "192.168.1.100",
            "ip_publica": "200.10.20.30",
            "dominio": "test.example.com",
            "puerto_local": "22",
            "puerto_externo": "2222",
            "version": "Ubuntu 22.04",
            "estado": "activo",
            "observaciones": "Test activo"
        }
        response = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json=payload)
        assert response.status_code == 200, f"Create activo failed: {response.text}"
        data = response.json()
        assert data["nombre"] == unique_name
        assert data["categoria"] == "Servidor"
        assert data["ip_local"] == "192.168.1.100"
        assert "id" in data
        print(f"✓ Created activo: {unique_name} (ID: {data['id']})")
        
        # Verify with GET
        get_resp = requests.get(f"{BASE_URL}/api/admin/activos/{data['id']}", headers=auth_headers)
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["nombre"] == unique_name
        print(f"✓ Verified activo via GET: {fetched['nombre']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/activos/{data['id']}", headers=auth_headers)
        return data["id"]
    
    def test_update_activo(self, auth_headers, test_empresa_id):
        """Test PUT /api/admin/activos/{id} updates activo"""
        # Create
        unique_name = f"TEST_Activo_Update_{uuid.uuid4().hex[:6]}"
        create_resp = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "categoria": "Router",
            "nombre": unique_name,
            "ip_local": "192.168.1.1",
            "estado": "activo"
        })
        assert create_resp.status_code == 200
        activo_id = create_resp.json()["id"]
        
        # Update
        updated_name = f"{unique_name}_Updated"
        update_resp = requests.put(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "categoria": "Router",
            "nombre": updated_name,
            "ip_local": "192.168.1.254",
            "estado": "mantenimiento",
            "observaciones": "Updated for testing"
        })
        assert update_resp.status_code == 200
        print(f"✓ Updated activo: {updated_name}")
        
        # Verify update persisted
        get_resp = requests.get(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers)
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        assert fetched["nombre"] == updated_name
        assert fetched["ip_local"] == "192.168.1.254"
        assert fetched["estado"] == "mantenimiento"
        print(f"✓ Verified update persisted: estado={fetched['estado']}, ip={fetched['ip_local']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers)
    
    def test_delete_activo(self, auth_headers, test_empresa_id):
        """Test DELETE /api/admin/activos/{id} deletes activo"""
        # Create
        unique_name = f"TEST_Activo_Delete_{uuid.uuid4().hex[:6]}"
        create_resp = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "categoria": "Mikrotik",
            "nombre": unique_name,
            "estado": "activo"
        })
        assert create_resp.status_code == 200
        activo_id = create_resp.json()["id"]
        
        # Delete
        delete_resp = requests.delete(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers)
        assert delete_resp.status_code == 200
        print(f"✓ Deleted activo: {unique_name}")
        
        # Verify deleted
        get_resp = requests.get(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers)
        assert get_resp.status_code == 404
        print(f"✓ Verified activo deleted (404)")
    
    # ==================== CREDENCIALES ====================
    
    def test_credenciales_crud(self, auth_headers, test_empresa_id):
        """Test full CRUD for credenciales"""
        # Create activo first
        unique_name = f"TEST_Activo_Cred_{uuid.uuid4().hex[:6]}"
        activo_resp = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "categoria": "Servidor",
            "nombre": unique_name,
            "estado": "activo"
        })
        assert activo_resp.status_code == 200
        activo_id = activo_resp.json()["id"]
        
        # GET credenciales (should be empty)
        get_resp = requests.get(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers)
        assert get_resp.status_code == 200
        assert len(get_resp.json()) == 0
        print(f"✓ GET credenciales (empty): 0 credentials")
        
        # CREATE credential - NID type
        cred_payload = {
            "activo_id": activo_id,
            "tipo_acceso": "NID",
            "usuario": "admin_nid",
            "password": "secretpassword123",
            "url_acceso": "",
            "observaciones": "Test NID credential"
        }
        create_resp = requests.post(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers, json=cred_payload)
        assert create_resp.status_code == 200
        cred_data = create_resp.json()
        assert cred_data["tipo_acceso"] == "NID"
        assert cred_data["usuario"] == "admin_nid"
        assert cred_data["password"] == "secretpassword123"
        cred_id = cred_data["id"]
        print(f"✓ Created credential: NID - admin_nid")
        
        # CREATE another credential - SSH type
        ssh_payload = {
            "activo_id": activo_id,
            "tipo_acceso": "SSH",
            "usuario": "root",
            "password": "sshpassword456",
            "url_acceso": "ssh://192.168.1.100:22",
            "observaciones": "SSH access"
        }
        ssh_resp = requests.post(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers, json=ssh_payload)
        assert ssh_resp.status_code == 200
        ssh_cred_id = ssh_resp.json()["id"]
        print(f"✓ Created credential: SSH - root")
        
        # GET credenciales (should have 2)
        get_resp = requests.get(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers)
        assert get_resp.status_code == 200
        creds = get_resp.json()
        assert len(creds) == 2
        print(f"✓ GET credenciales: {len(creds)} credentials found")
        
        # UPDATE credential
        update_resp = requests.put(f"{BASE_URL}/api/admin/credenciales/{cred_id}", headers=auth_headers, json={
            "activo_id": activo_id,
            "tipo_acceso": "NID",
            "usuario": "admin_nid_updated",
            "password": "newpassword789",
            "url_acceso": "",
            "observaciones": "Updated credential"
        })
        assert update_resp.status_code == 200
        print(f"✓ Updated credential: admin_nid -> admin_nid_updated")
        
        # Verify update
        get_resp = requests.get(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers)
        creds = get_resp.json()
        nid_cred = next((c for c in creds if c["tipo_acceso"] == "NID"), None)
        assert nid_cred is not None
        assert nid_cred["usuario"] == "admin_nid_updated"
        assert nid_cred["password"] == "newpassword789"
        print(f"✓ Verified credential update persisted")
        
        # DELETE credential
        delete_resp = requests.delete(f"{BASE_URL}/api/admin/credenciales/{ssh_cred_id}", headers=auth_headers)
        assert delete_resp.status_code == 200
        print(f"✓ Deleted SSH credential")
        
        # Verify delete
        get_resp = requests.get(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers)
        creds = get_resp.json()
        assert len(creds) == 1
        print(f"✓ Verified credential deleted: {len(creds)} remaining")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers)
    
    def test_credential_types(self, auth_headers, test_empresa_id):
        """Test various credential types: NID, Correo, Zimbra, SSH, RDP, Panel Web, etc."""
        # Create activo
        unique_name = f"TEST_Activo_CredTypes_{uuid.uuid4().hex[:6]}"
        activo_resp = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "categoria": "Servidor",
            "nombre": unique_name,
            "estado": "activo"
        })
        activo_id = activo_resp.json()["id"]
        
        credential_types = ["NID", "Correo", "Zimbra", "SSH", "RDP", "Panel Web", "Winbox", "FTP", "VPN", "Base de Datos", "WiFi", "Otro"]
        
        for cred_type in credential_types:
            resp = requests.post(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers, json={
                "activo_id": activo_id,
                "tipo_acceso": cred_type,
                "usuario": f"user_{cred_type.lower().replace(' ', '_')}",
                "password": f"pass_{cred_type}",
                "url_acceso": "",
                "observaciones": f"Test {cred_type}"
            })
            assert resp.status_code == 200, f"Failed to create {cred_type} credential: {resp.text}"
        
        # Verify all created
        get_resp = requests.get(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers)
        creds = get_resp.json()
        assert len(creds) == len(credential_types)
        print(f"✓ All {len(credential_types)} credential types created successfully")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers)
    
    # ==================== HISTORIAL ====================
    
    def test_historial(self, auth_headers, test_empresa_id):
        """Test GET /api/admin/activos/{id}/historial returns action history"""
        # Create activo
        unique_name = f"TEST_Activo_Hist_{uuid.uuid4().hex[:6]}"
        activo_resp = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "categoria": "DVR",
            "nombre": unique_name,
            "estado": "activo"
        })
        activo_id = activo_resp.json()["id"]
        
        # Update activo to generate history
        requests.put(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "categoria": "DVR",
            "nombre": unique_name,
            "estado": "mantenimiento",
            "observaciones": "Changed to maintenance"
        })
        
        # Add credential to generate history
        requests.post(f"{BASE_URL}/api/admin/activos/{activo_id}/credenciales", headers=auth_headers, json={
            "activo_id": activo_id,
            "tipo_acceso": "Panel Web",
            "usuario": "admin",
            "password": "admin123"
        })
        
        # Get historial
        hist_resp = requests.get(f"{BASE_URL}/api/admin/activos/{activo_id}/historial", headers=auth_headers)
        assert hist_resp.status_code == 200
        historial = hist_resp.json()
        assert isinstance(historial, list)
        assert len(historial) >= 2, "Should have at least 2 history entries (create + edit)"
        
        # Check structure
        entry = historial[0]
        assert "id" in entry
        assert "activo_id" in entry
        assert "usuario_id" in entry
        assert "usuario_nombre" in entry
        assert "accion" in entry
        assert "fecha" in entry
        
        print(f"✓ GET historial: {len(historial)} entries")
        for h in historial[:3]:
            print(f"  - {h['accion']}: {h.get('detalle', '')[:50]}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/activos/{activo_id}", headers=auth_headers)
    
    # ==================== REPORTES ====================
    
    def test_reportes_inventario_sin_credenciales(self, auth_headers):
        """Test GET /api/admin/reportes/inventario without credentials"""
        response = requests.get(f"{BASE_URL}/api/admin/reportes/inventario", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET reportes/inventario (sin credenciales): {len(data)} activos")
        
        if data:
            # Check structure
            entry = data[0]
            assert "empresa" in entry
            assert "categoria" in entry
            assert "nombre" in entry
            assert "ip_local" in entry
            assert "estado" in entry
            # Should NOT have credenciales
            assert "credenciales" not in entry or entry.get("credenciales") is None
            print(f"  First entry: {entry['nombre']} - {entry['empresa']}")
    
    def test_reportes_inventario_con_credenciales(self, auth_headers):
        """Test GET /api/admin/reportes/inventario with credentials"""
        response = requests.get(f"{BASE_URL}/api/admin/reportes/inventario?incluir_credenciales=true", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET reportes/inventario (con credenciales): {len(data)} activos")
        
        # Find an entry with credentials
        with_creds = [d for d in data if d.get("credenciales")]
        if with_creds:
            entry = with_creds[0]
            assert "credenciales" in entry
            assert isinstance(entry["credenciales"], list)
            if entry["credenciales"]:
                cred = entry["credenciales"][0]
                assert "tipo_acceso" in cred
                assert "usuario" in cred
                assert "password" in cred
                print(f"  Entry with credentials: {entry['nombre']} has {len(entry['credenciales'])} credentials")
    
    def test_reportes_inventario_by_empresa(self, auth_headers, test_empresa_id):
        """Test GET /api/admin/reportes/inventario filtered by empresa"""
        response = requests.get(f"{BASE_URL}/api/admin/reportes/inventario?empresa_id={test_empresa_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET reportes/inventario by empresa: {len(data)} activos")
    
    # ==================== EDGE CASES ====================
    
    def test_activo_required_fields(self, auth_headers, test_empresa_id):
        """Test that required fields are validated"""
        # Missing empresa_id
        resp = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json={
            "categoria": "Servidor",
            "nombre": "Test"
        })
        assert resp.status_code in [400, 422], "Should reject missing empresa_id"
        print(f"✓ Validation: Missing empresa_id rejected")
        
        # Missing categoria
        resp = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "nombre": "Test"
        })
        assert resp.status_code in [400, 422], "Should reject missing categoria"
        print(f"✓ Validation: Missing categoria rejected")
        
        # Missing nombre
        resp = requests.post(f"{BASE_URL}/api/admin/activos", headers=auth_headers, json={
            "empresa_id": test_empresa_id,
            "categoria": "Servidor"
        })
        assert resp.status_code in [400, 422], "Should reject missing nombre"
        print(f"✓ Validation: Missing nombre rejected")
    
    def test_activo_not_found(self, auth_headers):
        """Test 404 for non-existent activo"""
        fake_id = str(uuid.uuid4())
        resp = requests.get(f"{BASE_URL}/api/admin/activos/{fake_id}", headers=auth_headers)
        assert resp.status_code == 404
        print(f"✓ GET non-existent activo returns 404")
        
        resp = requests.delete(f"{BASE_URL}/api/admin/activos/{fake_id}", headers=auth_headers)
        assert resp.status_code == 404
        print(f"✓ DELETE non-existent activo returns 404")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
