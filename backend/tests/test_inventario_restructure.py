"""
Test suite for Inventario Restructure - New Categories, Dynamic Fields, Device Assignment
Tests:
- GET /api/admin/categorias returns 4 new categories with correct subtipos
- POST /api/admin/activos accepts campos_personalizados and activos_asignados
- Create activos with different subtypes (Office 365, AnyDesk, Dispositivos)
- GET /api/admin/activos returns activos with new fields
- Update activo's activos_asignados to link cuenta to device
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "jose@aranduinformatica.net"
ADMIN_PASSWORD = "secreto2026**"

class TestInventarioRestructure:
    """Tests for the new Inventario structure with categories, campos_personalizados, and device assignment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token, get first empresa"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_res = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        self.token = login_res.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Get first empresa for testing
        empresas_res = self.session.get(f"{BASE_URL}/api/admin/empresas")
        assert empresas_res.status_code == 200
        empresas = empresas_res.json()
        if empresas:
            self.empresa_id = empresas[0]["id"]
            self.empresa_nombre = empresas[0]["nombre"]
        else:
            # Create a test empresa if none exists
            create_emp = self.session.post(f"{BASE_URL}/api/admin/empresas", json={
                "nombre": "TEST_Empresa_Inventario",
                "ruc": "12345678-9"
            })
            assert create_emp.status_code == 200
            self.empresa_id = create_emp.json()["id"]
            self.empresa_nombre = "TEST_Empresa_Inventario"
        
        # Track created activos for cleanup
        self.created_activos = []
        
        yield
        
        # Cleanup: Delete test activos
        for activo_id in self.created_activos:
            try:
                self.session.delete(f"{BASE_URL}/api/admin/activos/{activo_id}")
            except:
                pass
    
    def test_01_categorias_returns_4_new_categories(self):
        """GET /api/admin/categorias returns the 4 new categories with correct subtipos"""
        res = self.session.get(f"{BASE_URL}/api/admin/categorias")
        assert res.status_code == 200, f"Failed to get categorias: {res.text}"
        
        categorias = res.json()
        assert isinstance(categorias, list), "Response should be a list"
        
        # Expected categories
        expected_cats = ["Servidores", "Dispositivos", "Cuentas de Acceso", "Dominios y Servicios"]
        cat_names = [c["nombre"] for c in categorias]
        
        for expected in expected_cats:
            assert expected in cat_names, f"Category '{expected}' not found in {cat_names}"
        
        # Check subtipos for each category
        for cat in categorias:
            if cat["nombre"] == "Servidores":
                assert "Windows Server" in cat["subtipos"], "Servidores should have 'Windows Server' subtipo"
                assert "Linux" in cat["subtipos"], "Servidores should have 'Linux' subtipo"
                assert "Proxmox" in cat["subtipos"], "Servidores should have 'Proxmox' subtipo"
            elif cat["nombre"] == "Dispositivos":
                assert "PC Escritorio" in cat["subtipos"], "Dispositivos should have 'PC Escritorio' subtipo"
                assert "Notebook" in cat["subtipos"], "Dispositivos should have 'Notebook' subtipo"
                assert "Mikrotik" in cat["subtipos"], "Dispositivos should have 'Mikrotik' subtipo"
            elif cat["nombre"] == "Cuentas de Acceso":
                assert "AnyDesk" in cat["subtipos"], "Cuentas de Acceso should have 'AnyDesk' subtipo"
                assert "Office 365" in cat["subtipos"], "Cuentas de Acceso should have 'Office 365' subtipo"
                assert "Correo" in cat["subtipos"], "Cuentas de Acceso should have 'Correo' subtipo"
                assert "Zimbra" in cat["subtipos"], "Cuentas de Acceso should have 'Zimbra' subtipo"
                assert "SSH" in cat["subtipos"], "Cuentas de Acceso should have 'SSH' subtipo"
                assert "RDP" in cat["subtipos"], "Cuentas de Acceso should have 'RDP' subtipo"
            elif cat["nombre"] == "Dominios y Servicios":
                assert "Dominio Web" in cat["subtipos"], "Dominios y Servicios should have 'Dominio Web' subtipo"
                assert "DNS" in cat["subtipos"], "Dominios y Servicios should have 'DNS' subtipo"
        
        print(f"PASS: Found {len(categorias)} categories with correct subtipos")
    
    def test_02_create_activo_office365_with_campos_personalizados(self):
        """Create activo with categoria='Cuentas de Acceso', subtipo='Office 365' and campos_personalizados"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Cuentas de Acceso",
            "subtipo": "Office 365",
            "nombre": f"TEST_Office365_{unique_id}",
            "descripcion": "Test Office 365 account",
            "estado": "activo",
            "campos_personalizados": {
                "tenant": "test.onmicrosoft.com",
                "admin_email": "admin@test.com",
                "contrasena": "pass123",
                "licencias": "Business Basic x5"
            },
            "activos_asignados": []
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/activos", json=payload)
        assert res.status_code == 200, f"Failed to create Office 365 activo: {res.text}"
        
        activo = res.json()
        self.created_activos.append(activo["id"])
        
        # Verify response structure
        assert activo["categoria"] == "Cuentas de Acceso"
        assert activo["subtipo"] == "Office 365"
        assert "campos_personalizados" in activo
        assert activo["campos_personalizados"]["tenant"] == "test.onmicrosoft.com"
        assert activo["campos_personalizados"]["admin_email"] == "admin@test.com"
        assert activo["campos_personalizados"]["contrasena"] == "pass123"
        assert "activos_asignados" in activo
        
        print(f"PASS: Created Office 365 activo with campos_personalizados: {activo['id']}")
        return activo["id"]
    
    def test_03_create_activo_anydesk_with_campos_personalizados(self):
        """Create activo with categoria='Cuentas de Acceso', subtipo='AnyDesk' and campos_personalizados"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Cuentas de Acceso",
            "subtipo": "AnyDesk",
            "nombre": f"TEST_AnyDesk_{unique_id}",
            "descripcion": "Test AnyDesk account",
            "estado": "activo",
            "campos_personalizados": {
                "id_anydesk": "123456789",
                "alias": "PC-Recepcion",
                "contrasena": "anydesk_pass"
            },
            "activos_asignados": []
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/activos", json=payload)
        assert res.status_code == 200, f"Failed to create AnyDesk activo: {res.text}"
        
        activo = res.json()
        self.created_activos.append(activo["id"])
        
        # Verify response structure
        assert activo["categoria"] == "Cuentas de Acceso"
        assert activo["subtipo"] == "AnyDesk"
        assert activo["campos_personalizados"]["id_anydesk"] == "123456789"
        assert activo["campos_personalizados"]["alias"] == "PC-Recepcion"
        
        print(f"PASS: Created AnyDesk activo with campos_personalizados: {activo['id']}")
        return activo["id"]
    
    def test_04_create_activo_dispositivo_standard(self):
        """Create activo with categoria='Dispositivos', subtipo='PC Escritorio' (standard fields)"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Dispositivos",
            "subtipo": "PC Escritorio",
            "nombre": f"TEST_PC_{unique_id}",
            "descripcion": "Test PC Escritorio",
            "ubicacion": "Oficina Principal",
            "ip_local": "192.168.1.100",
            "estado": "activo",
            "campos_personalizados": {},
            "activos_asignados": []
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/activos", json=payload)
        assert res.status_code == 200, f"Failed to create Dispositivo activo: {res.text}"
        
        activo = res.json()
        self.created_activos.append(activo["id"])
        
        # Verify response structure
        assert activo["categoria"] == "Dispositivos"
        assert activo["subtipo"] == "PC Escritorio"
        assert activo["ip_local"] == "192.168.1.100"
        assert activo["ubicacion"] == "Oficina Principal"
        assert "campos_personalizados" in activo
        assert "activos_asignados" in activo
        
        print(f"PASS: Created Dispositivo activo: {activo['id']}")
        return activo["id"]
    
    def test_05_get_activos_returns_new_fields(self):
        """GET /api/admin/activos returns activos with campos_personalizados and activos_asignados"""
        res = self.session.get(f"{BASE_URL}/api/admin/activos")
        assert res.status_code == 200, f"Failed to get activos: {res.text}"
        
        activos = res.json()
        assert isinstance(activos, list), "Response should be a list"
        
        # Check that NEW activos (created with new structure) have the new fields
        # Legacy activos may not have these fields
        new_activos = [a for a in activos if a.get("nombre", "").startswith("TEST_")]
        
        for activo in new_activos:
            assert "campos_personalizados" in activo, f"Activo {activo['id']} missing campos_personalizados"
            assert "activos_asignados" in activo, f"Activo {activo['id']} missing activos_asignados"
            assert "categoria" in activo
            assert "subtipo" in activo
        
        # Also verify that all activos have basic required fields
        for activo in activos:
            assert "categoria" in activo, f"Activo {activo['id']} missing categoria"
            assert "id" in activo
            assert "nombre" in activo
        
        print(f"PASS: GET /api/admin/activos returns {len(activos)} activos ({len(new_activos)} with new fields)")
    
    def test_06_update_activo_assign_device(self):
        """Update an activo's activos_asignados to link a cuenta to a device"""
        unique_id = str(uuid.uuid4())[:8]
        
        # First create a device
        device_payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Dispositivos",
            "subtipo": "Notebook",
            "nombre": f"TEST_Notebook_{unique_id}",
            "descripcion": "Test Notebook for assignment",
            "ip_local": "192.168.1.50",
            "estado": "activo",
            "campos_personalizados": {},
            "activos_asignados": []
        }
        device_res = self.session.post(f"{BASE_URL}/api/admin/activos", json=device_payload)
        assert device_res.status_code == 200, f"Failed to create device: {device_res.text}"
        device = device_res.json()
        self.created_activos.append(device["id"])
        
        # Create a cuenta
        cuenta_payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Cuentas de Acceso",
            "subtipo": "SSH",
            "nombre": f"TEST_SSH_{unique_id}",
            "descripcion": "Test SSH account",
            "estado": "activo",
            "campos_personalizados": {
                "host": "192.168.1.50",
                "puerto": "22",
                "usuario": "admin",
                "contrasena": "ssh_pass"
            },
            "activos_asignados": []
        }
        cuenta_res = self.session.post(f"{BASE_URL}/api/admin/activos", json=cuenta_payload)
        assert cuenta_res.status_code == 200, f"Failed to create cuenta: {cuenta_res.text}"
        cuenta = cuenta_res.json()
        self.created_activos.append(cuenta["id"])
        
        # Update cuenta to assign it to the device
        update_payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Cuentas de Acceso",
            "subtipo": "SSH",
            "nombre": cuenta["nombre"],
            "descripcion": cuenta["descripcion"],
            "estado": "activo",
            "campos_personalizados": cuenta["campos_personalizados"],
            "activos_asignados": [device["id"]]  # Assign to device
        }
        update_res = self.session.put(f"{BASE_URL}/api/admin/activos/{cuenta['id']}", json=update_payload)
        assert update_res.status_code == 200, f"Failed to update cuenta: {update_res.text}"
        
        # Verify the assignment by getting the activo
        get_res = self.session.get(f"{BASE_URL}/api/admin/activos/{cuenta['id']}")
        assert get_res.status_code == 200
        updated_cuenta = get_res.json()
        
        assert device["id"] in updated_cuenta["activos_asignados"], "Device should be in activos_asignados"
        
        print(f"PASS: Successfully assigned cuenta {cuenta['id']} to device {device['id']}")
    
    def test_07_create_correo_cuenta_with_campos(self):
        """Create activo with categoria='Cuentas de Acceso', subtipo='Correo' with specific fields"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Cuentas de Acceso",
            "subtipo": "Correo",
            "nombre": f"TEST_Correo_{unique_id}",
            "descripcion": "Test email account",
            "estado": "activo",
            "campos_personalizados": {
                "servidor": "mail.empresa.com",
                "correo": "usuario@empresa.com",
                "contrasena": "email_pass",
                "protocolo": "IMAP",
                "puerto": "993"
            },
            "activos_asignados": []
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/activos", json=payload)
        assert res.status_code == 200, f"Failed to create Correo activo: {res.text}"
        
        activo = res.json()
        self.created_activos.append(activo["id"])
        
        # Verify response structure
        assert activo["categoria"] == "Cuentas de Acceso"
        assert activo["subtipo"] == "Correo"
        assert activo["campos_personalizados"]["servidor"] == "mail.empresa.com"
        assert activo["campos_personalizados"]["correo"] == "usuario@empresa.com"
        assert activo["campos_personalizados"]["protocolo"] == "IMAP"
        assert activo["campos_personalizados"]["puerto"] == "993"
        
        print(f"PASS: Created Correo activo with campos_personalizados: {activo['id']}")
    
    def test_08_create_servidor_activo(self):
        """Create activo with categoria='Servidores' (standard server fields)"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "empresa_id": self.empresa_id,
            "categoria": "Servidores",
            "subtipo": "Linux",
            "nombre": f"TEST_Server_{unique_id}",
            "descripcion": "Test Linux Server",
            "ubicacion": "Datacenter",
            "ip_local": "192.168.1.10",
            "ip_publica": "200.1.1.10",
            "dominio": "server.test.com",
            "puerto_local": "22",
            "puerto_externo": "2222",
            "version": "Ubuntu 22.04",
            "estado": "activo",
            "campos_personalizados": {},
            "activos_asignados": []
        }
        
        res = self.session.post(f"{BASE_URL}/api/admin/activos", json=payload)
        assert res.status_code == 200, f"Failed to create Servidor activo: {res.text}"
        
        activo = res.json()
        self.created_activos.append(activo["id"])
        
        # Verify response structure
        assert activo["categoria"] == "Servidores"
        assert activo["subtipo"] == "Linux"
        assert activo["ip_local"] == "192.168.1.10"
        assert activo["ip_publica"] == "200.1.1.10"
        assert activo["dominio"] == "server.test.com"
        
        print(f"PASS: Created Servidor activo: {activo['id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
