"""
Test suite for Granular RBAC (Role-Based Access Control) feature
Tests: User creation with permissions, empresa assignment, permission enforcement
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Admin credentials
ADMIN_EMAIL = "jose@aranduinformatica.net"
ADMIN_PASSWORD = "secreto2026**"

# Test user data
TEST_USER_EMAIL = f"test_rbac_{uuid.uuid4().hex[:8]}@test.com"
TEST_USER_PASSWORD = "testpass123"
TEST_USER_NAME = "TEST_RBAC_User"


class TestRBACSetup:
    """Setup tests - verify admin login and get token"""
    
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
        assert data["user"]["role"] == "admin"
        return data["access_token"]
    
    def test_admin_login_success(self, admin_token):
        """Test admin login works with correct credentials"""
        assert admin_token is not None
        print(f"SUCCESS: Admin login successful, token obtained")
    
    def test_admin_login_returns_permisos_and_empresas(self):
        """Test that login response includes permisos and empresas_asignadas"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        user = data["user"]
        
        # Admin should have these fields (even if empty for admin)
        assert "permisos" in user, "permisos field missing from login response"
        assert "empresas_asignadas" in user, "empresas_asignadas field missing from login response"
        print(f"SUCCESS: Login response includes permisos and empresas_asignadas")


class TestPermisosDisponibles:
    """Test the permisos-disponibles endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_permisos_disponibles_admin_only(self, admin_token):
        """Test GET /api/admin/permisos-disponibles returns permissions matrix (admin only)"""
        response = requests.get(
            f"{BASE_URL}/api/admin/permisos-disponibles",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify expected modules exist
        expected_modules = ["empresas", "presupuestos", "inventario", "credenciales", 
                          "reportes", "alertas", "costos", "estadisticas"]
        for module in expected_modules:
            assert module in data, f"Module {module} missing from permisos-disponibles"
        
        # Verify empresas has expected actions
        assert "ver" in data["empresas"]
        assert "crear" in data["empresas"]
        assert "editar" in data["empresas"]
        assert "eliminar" in data["empresas"]
        
        print(f"SUCCESS: permisos-disponibles returns complete permissions matrix")
        print(f"Modules: {list(data.keys())}")


class TestUserCreationWithRBAC:
    """Test creating users with specific permissions and empresa assignments"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def test_empresa_id(self, admin_token):
        """Get or create a test empresa"""
        # First try to get existing empresas
        response = requests.get(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and response.json():
            return response.json()[0]["id"]
        
        # Create a test empresa if none exist
        response = requests.post(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={"nombre": "TEST_RBAC_Empresa", "ruc": "12345678-9"}
        )
        assert response.status_code == 200
        return response.json()["id"]
    
    def test_create_user_with_role_usuario(self, admin_token, test_empresa_id):
        """Test admin can create a new user with role 'usuario' and specific permisos"""
        user_email = f"test_rbac_create_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": "testpass123",
                "name": "TEST_RBAC_CreateUser",
                "role": "usuario",
                "permisos": ["empresas.ver", "presupuestos.ver", "presupuestos.crear"],
                "empresas_asignadas": [test_empresa_id]
            }
        )
        
        assert response.status_code == 200, f"Failed to create user: {response.text}"
        data = response.json()
        
        assert data["role"] == "usuario"
        assert "empresas.ver" in data["permisos"]
        assert "presupuestos.ver" in data["permisos"]
        assert "presupuestos.crear" in data["permisos"]
        assert test_empresa_id in data["empresas_asignadas"]
        
        print(f"SUCCESS: Created user with permisos: {data['permisos']}")
        print(f"SUCCESS: Created user with empresas_asignadas: {data['empresas_asignadas']}")
        
        # Cleanup - delete the test user
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_update_user_permisos_and_empresas(self, admin_token, test_empresa_id):
        """Test admin can update a user's permisos and empresas_asignadas"""
        # First create a user
        user_email = f"test_rbac_update_{uuid.uuid4().hex[:8]}@test.com"
        
        create_response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": "testpass123",
                "name": "TEST_RBAC_UpdateUser",
                "role": "usuario",
                "permisos": ["empresas.ver"],
                "empresas_asignadas": []
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Now update the user
        update_response = requests.put(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": "",  # Empty = don't change password
                "name": "TEST_RBAC_UpdateUser_Modified",
                "role": "usuario",
                "permisos": ["empresas.ver", "empresas.editar", "inventario.ver"],
                "empresas_asignadas": [test_empresa_id]
            }
        )
        
        assert update_response.status_code == 200, f"Failed to update user: {update_response.text}"
        data = update_response.json()
        
        assert "empresas.editar" in data["permisos"]
        assert "inventario.ver" in data["permisos"]
        assert test_empresa_id in data["empresas_asignadas"]
        
        print(f"SUCCESS: Updated user permisos to: {data['permisos']}")
        print(f"SUCCESS: Updated user empresas_asignadas to: {data['empresas_asignadas']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


class TestRestrictedUserLogin:
    """Test that restricted user login returns permisos and empresas_asignadas"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def test_empresa_id(self, admin_token):
        response = requests.get(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and response.json():
            return response.json()[0]["id"]
        return None
    
    def test_restricted_user_login_returns_permisos(self, admin_token, test_empresa_id):
        """Test that restricted user login returns permisos and empresas_asignadas in token response"""
        user_email = f"test_rbac_login_{uuid.uuid4().hex[:8]}@test.com"
        user_password = "testpass123"
        
        # Create restricted user
        create_response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": user_password,
                "name": "TEST_RBAC_LoginUser",
                "role": "usuario",
                "permisos": ["empresas.ver", "presupuestos.ver"],
                "empresas_asignadas": [test_empresa_id] if test_empresa_id else []
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Login as restricted user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_email,
            "password": user_password
        })
        
        assert login_response.status_code == 200, f"Restricted user login failed: {login_response.text}"
        data = login_response.json()
        
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "usuario"
        assert "permisos" in data["user"]
        assert "empresas_asignadas" in data["user"]
        assert "empresas.ver" in data["user"]["permisos"]
        assert "presupuestos.ver" in data["user"]["permisos"]
        
        print(f"SUCCESS: Restricted user login returns permisos: {data['user']['permisos']}")
        print(f"SUCCESS: Restricted user login returns empresas_asignadas: {data['user']['empresas_asignadas']}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


class TestEmpresaAccessControl:
    """Test empresa access control based on empresas_asignadas"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def test_empresas(self, admin_token):
        """Get or create two test empresas"""
        response = requests.get(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        empresas = response.json() if response.status_code == 200 else []
        
        if len(empresas) >= 2:
            return [empresas[0]["id"], empresas[1]["id"]]
        
        # Create empresas if needed
        ids = []
        for i in range(2 - len(empresas)):
            resp = requests.post(
                f"{BASE_URL}/api/admin/empresas",
                headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
                json={"nombre": f"TEST_RBAC_Empresa_{i}", "ruc": f"1234567{i}-9"}
            )
            if resp.status_code == 200:
                ids.append(resp.json()["id"])
        
        return [e["id"] for e in empresas] + ids
    
    def test_restricted_user_with_empresas_ver_but_no_asignadas_gets_empty_list(self, admin_token):
        """Test restricted user with empresas.ver but NO empresas_asignadas gets empty empresas list"""
        user_email = f"test_rbac_empty_{uuid.uuid4().hex[:8]}@test.com"
        user_password = "testpass123"
        
        # Create user with empresas.ver but no empresas_asignadas
        create_response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": user_password,
                "name": "TEST_RBAC_NoEmpresas",
                "role": "usuario",
                "permisos": ["empresas.ver"],
                "empresas_asignadas": []  # No empresas assigned
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Login as restricted user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_email,
            "password": user_password
        })
        assert login_response.status_code == 200
        user_token = login_response.json()["access_token"]
        
        # Try to get empresas
        empresas_response = requests.get(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        assert empresas_response.status_code == 200
        empresas = empresas_response.json()
        assert len(empresas) == 0, f"Expected empty list, got {len(empresas)} empresas"
        
        print(f"SUCCESS: User with empresas.ver but no empresas_asignadas gets empty list")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_restricted_user_only_sees_assigned_empresas(self, admin_token, test_empresas):
        """Test restricted user with empresas.ver AND assigned empresas ONLY sees assigned empresas"""
        if len(test_empresas) < 2:
            pytest.skip("Need at least 2 empresas for this test")
        
        user_email = f"test_rbac_assigned_{uuid.uuid4().hex[:8]}@test.com"
        user_password = "testpass123"
        assigned_empresa = test_empresas[0]  # Only assign first empresa
        
        # Create user with only one empresa assigned
        create_response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": user_password,
                "name": "TEST_RBAC_OneEmpresa",
                "role": "usuario",
                "permisos": ["empresas.ver"],
                "empresas_asignadas": [assigned_empresa]
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Login as restricted user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_email,
            "password": user_password
        })
        assert login_response.status_code == 200
        user_token = login_response.json()["access_token"]
        
        # Get empresas
        empresas_response = requests.get(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {user_token}"}
        )
        
        assert empresas_response.status_code == 200
        empresas = empresas_response.json()
        
        # Should only see the assigned empresa
        empresa_ids = [e["id"] for e in empresas]
        assert assigned_empresa in empresa_ids, "Assigned empresa not in list"
        assert len(empresas) == 1, f"Expected 1 empresa, got {len(empresas)}"
        
        print(f"SUCCESS: User only sees assigned empresa (1 of {len(test_empresas)} total)")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


class TestPermissionEnforcement:
    """Test that permissions are enforced on CRUD endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def test_empresa_id(self, admin_token):
        response = requests.get(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and response.json():
            return response.json()[0]["id"]
        return None
    
    def test_user_without_presupuestos_crear_gets_403(self, admin_token, test_empresa_id):
        """Test restricted user WITHOUT presupuestos.crear permission gets 403 on POST /api/admin/presupuestos"""
        user_email = f"test_rbac_nopres_{uuid.uuid4().hex[:8]}@test.com"
        user_password = "testpass123"
        
        # Create user with empresas.ver but NOT presupuestos.crear
        create_response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": user_password,
                "name": "TEST_RBAC_NoPresupuestos",
                "role": "usuario",
                "permisos": ["empresas.ver", "presupuestos.ver"],  # No presupuestos.crear
                "empresas_asignadas": [test_empresa_id] if test_empresa_id else []
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Login as restricted user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_email,
            "password": user_password
        })
        assert login_response.status_code == 200
        user_token = login_response.json()["access_token"]
        
        # Try to create presupuesto - should get 403
        presupuesto_response = requests.post(
            f"{BASE_URL}/api/admin/presupuestos",
            headers={"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"},
            json={
                "empresa_id": test_empresa_id,
                "items": [{"descripcion": "Test", "cantidad": 1, "costo": 100, "margen": 30, "precio_unitario": 130, "subtotal": 130}],
                "subtotal": 118,
                "iva": 12,
                "total": 130
            }
        )
        
        assert presupuesto_response.status_code == 403, f"Expected 403, got {presupuesto_response.status_code}"
        print(f"SUCCESS: User without presupuestos.crear gets 403 on POST /api/admin/presupuestos")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_user_without_empresas_crear_gets_403(self, admin_token):
        """Test restricted user WITHOUT empresas.crear permission gets 403 on POST /api/admin/empresas"""
        user_email = f"test_rbac_noemp_{uuid.uuid4().hex[:8]}@test.com"
        user_password = "testpass123"
        
        # Create user with empresas.ver but NOT empresas.crear
        create_response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": user_password,
                "name": "TEST_RBAC_NoEmpresasCrear",
                "role": "usuario",
                "permisos": ["empresas.ver"],  # No empresas.crear
                "empresas_asignadas": []
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Login as restricted user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_email,
            "password": user_password
        })
        assert login_response.status_code == 200
        user_token = login_response.json()["access_token"]
        
        # Try to create empresa - should get 403
        empresa_response = requests.post(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"},
            json={"nombre": "TEST_Unauthorized_Empresa", "ruc": "99999999-9"}
        )
        
        assert empresa_response.status_code == 403, f"Expected 403, got {empresa_response.status_code}"
        print(f"SUCCESS: User without empresas.crear gets 403 on POST /api/admin/empresas")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_user_without_inventario_crear_gets_403(self, admin_token, test_empresa_id):
        """Test restricted user WITHOUT inventario.crear permission gets 403 on POST /api/admin/activos"""
        user_email = f"test_rbac_noinv_{uuid.uuid4().hex[:8]}@test.com"
        user_password = "testpass123"
        
        # Create user with inventario.ver but NOT inventario.crear
        create_response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": user_password,
                "name": "TEST_RBAC_NoInventarioCrear",
                "role": "usuario",
                "permisos": ["inventario.ver", "empresas.ver"],  # No inventario.crear
                "empresas_asignadas": [test_empresa_id] if test_empresa_id else []
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Login as restricted user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_email,
            "password": user_password
        })
        assert login_response.status_code == 200
        user_token = login_response.json()["access_token"]
        
        # Try to create activo - should get 403
        activo_response = requests.post(
            f"{BASE_URL}/api/admin/activos",
            headers={"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"},
            json={
                "empresa_id": test_empresa_id,
                "categoria": "Servidor",
                "nombre": "TEST_Unauthorized_Activo"
            }
        )
        
        assert activo_response.status_code == 403, f"Expected 403, got {activo_response.status_code}"
        print(f"SUCCESS: User without inventario.crear gets 403 on POST /api/admin/activos")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


class TestUserWithPermissionsCanPerformActions:
    """Test that users WITH correct permissions CAN perform actions"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def test_empresa_id(self, admin_token):
        response = requests.get(
            f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if response.status_code == 200 and response.json():
            return response.json()[0]["id"]
        return None
    
    def test_user_with_presupuestos_crear_can_create(self, admin_token, test_empresa_id):
        """Test user WITH presupuestos.crear permission CAN create presupuestos"""
        if not test_empresa_id:
            pytest.skip("No empresa available for test")
        
        user_email = f"test_rbac_canpres_{uuid.uuid4().hex[:8]}@test.com"
        user_password = "testpass123"
        
        # Create user with presupuestos.crear
        create_response = requests.post(
            f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"},
            json={
                "email": user_email,
                "password": user_password,
                "name": "TEST_RBAC_CanPresupuestos",
                "role": "usuario",
                "permisos": ["empresas.ver", "presupuestos.ver", "presupuestos.crear"],
                "empresas_asignadas": [test_empresa_id]
            }
        )
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Login as restricted user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_email,
            "password": user_password
        })
        assert login_response.status_code == 200
        user_token = login_response.json()["access_token"]
        
        # Create presupuesto - should succeed
        presupuesto_response = requests.post(
            f"{BASE_URL}/api/admin/presupuestos",
            headers={"Authorization": f"Bearer {user_token}", "Content-Type": "application/json"},
            json={
                "empresa_id": test_empresa_id,
                "items": [{"descripcion": "TEST_RBAC_Item", "cantidad": 1, "costo": 100, "margen": 30, "precio_unitario": 130, "subtotal": 130}],
                "subtotal": 118,
                "iva": 12,
                "total": 130
            }
        )
        
        assert presupuesto_response.status_code == 200, f"Expected 200, got {presupuesto_response.status_code}: {presupuesto_response.text}"
        presupuesto_id = presupuesto_response.json()["id"]
        print(f"SUCCESS: User with presupuestos.crear CAN create presupuestos")
        
        # Cleanup - delete presupuesto and user
        requests.delete(
            f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        requests.delete(
            f"{BASE_URL}/api/admin/usuarios/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
