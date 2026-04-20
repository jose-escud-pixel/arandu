"""
Backend API Tests for Arandu&JAR Informática - User Management & Role-Based Access Control
Tests cover:
- Admin login and authentication
- User CRUD operations (admin only)
- Role-based access control (admin vs usuario)
- Presupuestos and Empresas access with different roles
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "jose@aranduinformatica.net"
ADMIN_PASSWORD = "secreto2026**"
TEST_USER_EMAIL = f"testuser_{uuid.uuid4().hex[:8]}@test.com"
TEST_USER_PASSWORD = "test123"
TEST_USER_NAME = "Test User"


class TestHealthAndBasics:
    """Basic health check tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint returns healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ Health endpoint working")
    
    def test_root_endpoint(self):
        """Test root API endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "Arandu" in data.get("message", "")
        print("✓ Root endpoint working")


class TestAdminAuthentication:
    """Admin login and authentication tests"""
    
    def test_admin_login_success(self):
        """Test admin can login with correct credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful - role: {data['user']['role']}")
        return data["access_token"]
    
    def test_admin_login_wrong_password(self):
        """Test login fails with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✓ Login correctly rejected with wrong password")
    
    def test_admin_login_wrong_email(self):
        """Test login fails with non-existent email"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "anypassword"
        })
        assert response.status_code == 401
        print("✓ Login correctly rejected with non-existent email")
    
    def test_get_me_with_token(self):
        """Test /auth/me returns current user info"""
        # First login
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_res.json()["access_token"]
        
        # Get current user
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        print("✓ /auth/me returns correct user info")


class TestUserManagementCRUD:
    """User management CRUD operations - Admin only"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin authentication failed")
    
    def test_get_usuarios_list(self, admin_token):
        """Test admin can get list of users"""
        response = requests.get(f"{BASE_URL}/api/admin/usuarios", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least the admin user
        assert len(data) >= 1
        print(f"✓ GET /admin/usuarios returns {len(data)} users")
    
    def test_create_usuario(self, admin_token):
        """Test admin can create a new user with 'usuario' role"""
        new_user = {
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "name": TEST_USER_NAME,
            "role": "usuario"
        }
        response = requests.post(f"{BASE_URL}/api/admin/usuarios", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json=new_user
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_USER_EMAIL
        assert data["name"] == TEST_USER_NAME
        assert data["role"] == "usuario"
        assert "id" in data
        print(f"✓ Created user: {data['email']} with role: {data['role']}")
        return data
    
    def test_create_duplicate_user_fails(self, admin_token):
        """Test creating user with existing email fails"""
        # Try to create user with admin email
        response = requests.post(f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "email": ADMIN_EMAIL,
                "password": "test123",
                "name": "Duplicate",
                "role": "usuario"
            }
        )
        assert response.status_code == 400
        print("✓ Duplicate email correctly rejected")
    
    def test_create_user_invalid_role_fails(self, admin_token):
        """Test creating user with invalid role fails"""
        response = requests.post(f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "email": f"invalid_{uuid.uuid4().hex[:8]}@test.com",
                "password": "test123",
                "name": "Invalid Role",
                "role": "superadmin"  # Invalid role
            }
        )
        assert response.status_code == 400
        print("✓ Invalid role correctly rejected")


class TestNewUserLogin:
    """Test that newly created user can login"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin authentication failed")
    
    @pytest.fixture
    def created_user(self, admin_token):
        """Create a test user and return their info"""
        unique_email = f"logintest_{uuid.uuid4().hex[:8]}@test.com"
        response = requests.post(f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "email": unique_email,
                "password": "test123",
                "name": "Login Test User",
                "role": "usuario"
            }
        )
        if response.status_code == 200:
            return {"email": unique_email, "password": "test123", "id": response.json()["id"]}
        pytest.skip("Could not create test user")
    
    def test_new_user_can_login(self, created_user):
        """Test newly created user can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": created_user["email"],
            "password": created_user["password"]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == created_user["email"]
        assert data["user"]["role"] == "usuario"
        print(f"✓ New user {created_user['email']} can login with role: usuario")


class TestRoleBasedAccessControl:
    """Test role-based access control - admin vs usuario"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin authentication failed")
    
    @pytest.fixture
    def normal_user_token(self, admin_token):
        """Create a normal user and get their token"""
        unique_email = f"rbac_{uuid.uuid4().hex[:8]}@test.com"
        # Create user
        create_res = requests.post(f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "email": unique_email,
                "password": "test123",
                "name": "RBAC Test User",
                "role": "usuario"
            }
        )
        if create_res.status_code != 200:
            pytest.skip("Could not create test user")
        
        # Login as new user
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": unique_email,
            "password": "test123"
        })
        if login_res.status_code == 200:
            return login_res.json()["access_token"]
        pytest.skip("Could not login as test user")
    
    # ===== Tests for normal user (usuario role) =====
    
    def test_normal_user_cannot_access_usuarios_list(self, normal_user_token):
        """Normal user should NOT be able to access /admin/usuarios"""
        response = requests.get(f"{BASE_URL}/api/admin/usuarios", headers={
            "Authorization": f"Bearer {normal_user_token}"
        })
        assert response.status_code == 403
        print("✓ Normal user correctly denied access to /admin/usuarios")
    
    def test_normal_user_cannot_create_user(self, normal_user_token):
        """Normal user should NOT be able to create users"""
        response = requests.post(f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={
                "email": "hacker@test.com",
                "password": "test123",
                "name": "Hacker",
                "role": "admin"
            }
        )
        assert response.status_code == 403
        print("✓ Normal user correctly denied creating users")
    
    def test_normal_user_cannot_delete_user(self, normal_user_token, admin_token):
        """Normal user should NOT be able to delete users"""
        # Get admin user id
        users_res = requests.get(f"{BASE_URL}/api/admin/usuarios", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        admin_user = next((u for u in users_res.json() if u["email"] == ADMIN_EMAIL), None)
        
        if admin_user:
            response = requests.delete(f"{BASE_URL}/api/admin/usuarios/{admin_user['id']}", headers={
                "Authorization": f"Bearer {normal_user_token}"
            })
            assert response.status_code == 403
            print("✓ Normal user correctly denied deleting users")
    
    # ===== Tests for normal user CAN access read-only endpoints =====
    
    def test_normal_user_can_access_presupuestos_list(self, normal_user_token):
        """Normal user CAN access presupuestos list (read-only)"""
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos", headers={
            "Authorization": f"Bearer {normal_user_token}"
        })
        assert response.status_code == 200
        print("✓ Normal user CAN access presupuestos list")
    
    def test_normal_user_can_access_empresas_list(self, normal_user_token):
        """Normal user CAN access empresas list (read-only)"""
        response = requests.get(f"{BASE_URL}/api/admin/empresas", headers={
            "Authorization": f"Bearer {normal_user_token}"
        })
        assert response.status_code == 200
        print("✓ Normal user CAN access empresas list")
    
    def test_normal_user_can_access_stats(self, normal_user_token):
        """Normal user CAN access stats (read-only)"""
        response = requests.get(f"{BASE_URL}/api/admin/stats", headers={
            "Authorization": f"Bearer {normal_user_token}"
        })
        assert response.status_code == 200
        print("✓ Normal user CAN access stats")
    
    def test_normal_user_can_access_estadisticas(self, normal_user_token):
        """Normal user CAN access presupuesto estadisticas (read-only)"""
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos/estadisticas", headers={
            "Authorization": f"Bearer {normal_user_token}"
        })
        assert response.status_code == 200
        print("✓ Normal user CAN access estadisticas")
    
    # ===== Tests for normal user CANNOT modify =====
    
    def test_normal_user_cannot_create_empresa(self, normal_user_token):
        """Normal user should NOT be able to create empresas"""
        response = requests.post(f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {normal_user_token}"},
            json={"nombre": "Hacker Company"}
        )
        assert response.status_code == 403
        print("✓ Normal user correctly denied creating empresas")
    
    def test_normal_user_cannot_create_presupuesto(self, normal_user_token, admin_token):
        """Normal user should NOT be able to create presupuestos"""
        # First get an empresa id
        empresas_res = requests.get(f"{BASE_URL}/api/admin/empresas", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        empresas = empresas_res.json()
        
        if len(empresas) > 0:
            response = requests.post(f"{BASE_URL}/api/admin/presupuestos",
                headers={"Authorization": f"Bearer {normal_user_token}"},
                json={
                    "empresa_id": empresas[0]["id"],
                    "items": [{"descripcion": "Test", "cantidad": 1, "costo": 100, "margen": 30, "precio_unitario": 130, "subtotal": 130}],
                    "subtotal": 118,
                    "iva": 12,
                    "total": 130
                }
            )
            assert response.status_code == 403
            print("✓ Normal user correctly denied creating presupuestos")
        else:
            print("⚠ No empresas to test with, skipping presupuesto creation test")


class TestAdminCanDeleteUser:
    """Test admin can delete users but not themselves"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin authentication failed")
    
    def test_admin_cannot_delete_self(self, admin_token):
        """Admin should NOT be able to delete themselves"""
        # Get admin user id
        me_res = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        admin_id = me_res.json()["id"]
        
        response = requests.delete(f"{BASE_URL}/api/admin/usuarios/{admin_id}", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 400
        print("✓ Admin correctly prevented from deleting self")
    
    def test_admin_can_delete_other_user(self, admin_token):
        """Admin CAN delete other users"""
        # Create a user to delete
        unique_email = f"todelete_{uuid.uuid4().hex[:8]}@test.com"
        create_res = requests.post(f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "email": unique_email,
                "password": "test123",
                "name": "To Delete",
                "role": "usuario"
            }
        )
        assert create_res.status_code == 200
        user_id = create_res.json()["id"]
        
        # Delete the user
        delete_res = requests.delete(f"{BASE_URL}/api/admin/usuarios/{user_id}", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert delete_res.status_code == 200
        
        # Verify user is deleted
        users_res = requests.get(f"{BASE_URL}/api/admin/usuarios", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        user_ids = [u["id"] for u in users_res.json()]
        assert user_id not in user_ids
        print("✓ Admin successfully deleted other user")


class TestPresupuestoStatusWorkflow:
    """Test presupuesto status workflow: borrador -> aprobado -> facturado -> cobrado"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin authentication failed")
    
    @pytest.fixture
    def test_empresa(self, admin_token):
        """Create a test empresa"""
        response = requests.post(f"{BASE_URL}/api/admin/empresas",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"nombre": f"Test Empresa {uuid.uuid4().hex[:8]}"}
        )
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not create test empresa")
    
    @pytest.fixture
    def test_presupuesto(self, admin_token, test_empresa):
        """Create a test presupuesto"""
        response = requests.post(f"{BASE_URL}/api/admin/presupuestos",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "empresa_id": test_empresa["id"],
                "items": [{"descripcion": "Test Item", "cantidad": 1, "costo": 100000, "margen": 30, "precio_unitario": 130000, "subtotal": 130000}],
                "subtotal": 118182,
                "iva": 11818,
                "total": 130000
            }
        )
        if response.status_code == 200:
            return response.json()
        pytest.skip("Could not create test presupuesto")
    
    def test_status_workflow(self, admin_token, test_presupuesto):
        """Test full status workflow"""
        presupuesto_id = test_presupuesto["id"]
        
        # Initial status should be borrador
        assert test_presupuesto["estado"] == "borrador"
        print(f"✓ Initial status: borrador")
        
        # Change to aprobado
        res1 = requests.put(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/estado?estado=aprobado",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res1.status_code == 200
        print("✓ Changed status to: aprobado")
        
        # Change to facturado
        res2 = requests.put(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/estado?estado=facturado",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res2.status_code == 200
        print("✓ Changed status to: facturado")
        
        # Change to cobrado
        res3 = requests.put(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/estado?estado=cobrado",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res3.status_code == 200
        print("✓ Changed status to: cobrado")
        
        # Verify final status
        get_res = requests.get(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert get_res.status_code == 200
        assert get_res.json()["estado"] == "cobrado"
        print("✓ Full workflow completed: borrador -> aprobado -> facturado -> cobrado")


class TestNormalUserCannotChangeStatus:
    """Test that normal user cannot change presupuesto status"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        if response.status_code == 200:
            return response.json()["access_token"]
        pytest.skip("Admin authentication failed")
    
    @pytest.fixture
    def normal_user_token(self, admin_token):
        """Create a normal user and get their token"""
        unique_email = f"statustest_{uuid.uuid4().hex[:8]}@test.com"
        create_res = requests.post(f"{BASE_URL}/api/admin/usuarios",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "email": unique_email,
                "password": "test123",
                "name": "Status Test User",
                "role": "usuario"
            }
        )
        if create_res.status_code != 200:
            pytest.skip("Could not create test user")
        
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": unique_email,
            "password": "test123"
        })
        if login_res.status_code == 200:
            return login_res.json()["access_token"]
        pytest.skip("Could not login as test user")
    
    def test_normal_user_cannot_change_status(self, admin_token, normal_user_token):
        """Normal user should NOT be able to change presupuesto status"""
        # Get a presupuesto
        presupuestos_res = requests.get(f"{BASE_URL}/api/admin/presupuestos",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        presupuestos = presupuestos_res.json()
        
        if len(presupuestos) > 0:
            presupuesto_id = presupuestos[0]["id"]
            response = requests.put(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/estado?estado=aprobado",
                headers={"Authorization": f"Bearer {normal_user_token}"}
            )
            assert response.status_code == 403
            print("✓ Normal user correctly denied changing presupuesto status")
        else:
            print("⚠ No presupuestos to test with")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
