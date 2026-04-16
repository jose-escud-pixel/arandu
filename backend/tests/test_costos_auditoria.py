"""
Test suite for Costos Reales and Auditoria features
- Costos Reales modal: edit quantities, delete items, add new items, assign proveedor
- Proveedor payment tracking (pagado/pendiente)
- Auditoria (audit trail) page
- Proveedor stats endpoint
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "jose@aranduinformatica.net"
ADMIN_PASSWORD = "secreto2026**"


class TestSetup:
    """Setup and authentication tests"""
    
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
        """Get auth headers for API calls"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


class TestHealthAndBasics(TestSetup):
    """Basic health and API tests"""
    
    def test_health_endpoint(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
        print("✓ Health endpoint working")
    
    def test_admin_login(self, admin_token):
        """Test admin login returns valid token"""
        assert admin_token is not None
        assert len(admin_token) > 0
        print("✓ Admin login successful")


class TestCostosRealesEndpoint(TestSetup):
    """Test PUT /api/admin/presupuestos/{id}/costos endpoint"""
    
    def test_get_presupuestos_list(self, auth_headers):
        """Get list of presupuestos to find one for testing"""
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos", headers=auth_headers)
        assert response.status_code == 200
        presupuestos = response.json()
        assert isinstance(presupuestos, list)
        print(f"✓ Found {len(presupuestos)} presupuestos")
        return presupuestos
    
    def test_update_costos_reales_with_proveedor(self, auth_headers):
        """Test updating costos reales with proveedor field"""
        # First get a presupuesto
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos", headers=auth_headers)
        assert response.status_code == 200
        presupuestos = response.json()
        
        if len(presupuestos) == 0:
            pytest.skip("No presupuestos available for testing")
        
        presupuesto = presupuestos[0]
        presupuesto_id = presupuesto["id"]
        
        # Prepare costos data with proveedor fields
        costos_data = {
            "items": [
                {
                    "descripcion": "Test Item 1",
                    "cantidad": 2,
                    "costo_estimado": 100000,
                    "costo_real": 95000,
                    "observacion": "Test observation",
                    "proveedor": "Proveedor Test A",
                    "es_nuevo": False
                },
                {
                    "descripcion": "Viático Test",
                    "cantidad": 1,
                    "costo_estimado": 0,
                    "costo_real": 50000,
                    "observacion": "",
                    "proveedor": "Gastos Comunes",
                    "es_nuevo": True
                }
            ],
            "total_costos": 240000,
            "total_facturado": presupuesto.get("total", 300000),
            "ganancia": 60000,
            "proveedores_pagos": [
                {
                    "proveedor": "Proveedor Test A",
                    "monto_total": 190000,
                    "pagado": False,
                    "fecha_pago": None
                },
                {
                    "proveedor": "Gastos Comunes",
                    "monto_total": 50000,
                    "pagado": True,
                    "fecha_pago": "2026-01-15"
                }
            ]
        }
        
        # Update costos
        response = requests.put(
            f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/costos",
            headers=auth_headers,
            json=costos_data
        )
        assert response.status_code == 200, f"Failed to update costos: {response.text}"
        result = response.json()
        assert result.get("success") == True
        print(f"✓ Updated costos reales for presupuesto {presupuesto.get('numero', presupuesto_id)}")
        
        # Verify the update by fetching the presupuesto
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}", headers=auth_headers)
        assert response.status_code == 200
        updated = response.json()
        
        assert "costos_reales" in updated
        costos = updated["costos_reales"]
        assert len(costos["items"]) == 2
        assert costos["items"][0]["proveedor"] == "Proveedor Test A"
        assert costos["items"][1]["es_nuevo"] == True
        assert len(costos["proveedores_pagos"]) == 2
        print("✓ Costos reales data persisted correctly with proveedor fields")
    
    def test_costos_with_new_manual_item(self, auth_headers):
        """Test adding a new manual item (es_nuevo=true) like viáticos, hotel"""
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos", headers=auth_headers)
        presupuestos = response.json()
        
        if len(presupuestos) == 0:
            pytest.skip("No presupuestos available")
        
        presupuesto = presupuestos[0]
        presupuesto_id = presupuesto["id"]
        
        # Add manual items
        costos_data = {
            "items": [
                {
                    "descripcion": "Viáticos",
                    "cantidad": 3,
                    "costo_estimado": 0,
                    "costo_real": 150000,
                    "observacion": "Viaje a cliente",
                    "proveedor": "Gastos Internos",
                    "es_nuevo": True
                },
                {
                    "descripcion": "Hotel",
                    "cantidad": 2,
                    "costo_estimado": 0,
                    "costo_real": 200000,
                    "observacion": "2 noches",
                    "proveedor": "Hotel Guaraní",
                    "es_nuevo": True
                },
                {
                    "descripcion": "Comida",
                    "cantidad": 6,
                    "costo_estimado": 0,
                    "costo_real": 50000,
                    "observacion": "",
                    "proveedor": "Gastos Comunes",
                    "es_nuevo": True
                }
            ],
            "total_costos": 1050000,
            "total_facturado": presupuesto.get("total", 1500000),
            "ganancia": 450000,
            "proveedores_pagos": [
                {"proveedor": "Gastos Internos", "monto_total": 450000, "pagado": False, "fecha_pago": None},
                {"proveedor": "Hotel Guaraní", "monto_total": 400000, "pagado": True, "fecha_pago": "2026-01-10"},
                {"proveedor": "Gastos Comunes", "monto_total": 300000, "pagado": False, "fecha_pago": None}
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/costos",
            headers=auth_headers,
            json=costos_data
        )
        assert response.status_code == 200
        print("✓ Manual items (viáticos, hotel, comida) saved successfully")
    
    def test_costos_proveedor_payment_toggle(self, auth_headers):
        """Test toggling proveedor payment status"""
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos", headers=auth_headers)
        presupuestos = response.json()
        
        if len(presupuestos) == 0:
            pytest.skip("No presupuestos available")
        
        presupuesto = presupuestos[0]
        presupuesto_id = presupuesto["id"]
        
        # Set proveedor as pagado
        costos_data = {
            "items": [
                {
                    "descripcion": "Test Item",
                    "cantidad": 1,
                    "costo_estimado": 100000,
                    "costo_real": 100000,
                    "observacion": "",
                    "proveedor": "Proveedor Toggle Test",
                    "es_nuevo": False
                }
            ],
            "total_costos": 100000,
            "total_facturado": 150000,
            "ganancia": 50000,
            "proveedores_pagos": [
                {
                    "proveedor": "Proveedor Toggle Test",
                    "monto_total": 100000,
                    "pagado": True,
                    "fecha_pago": "2026-01-15"
                }
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/costos",
            headers=auth_headers,
            json=costos_data
        )
        assert response.status_code == 200
        
        # Verify
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}", headers=auth_headers)
        updated = response.json()
        pagos = updated["costos_reales"]["proveedores_pagos"]
        assert len(pagos) == 1
        assert pagos[0]["pagado"] == True
        assert pagos[0]["fecha_pago"] == "2026-01-15"
        print("✓ Proveedor payment status toggle works correctly")


class TestAuditoriaEndpoint(TestSetup):
    """Test GET /api/admin/auditoria endpoint"""
    
    def test_get_auditoria_logs(self, auth_headers):
        """Test fetching audit logs"""
        response = requests.get(f"{BASE_URL}/api/admin/auditoria", headers=auth_headers)
        assert response.status_code == 200
        logs = response.json()
        assert isinstance(logs, list)
        print(f"✓ Auditoria endpoint returns {len(logs)} logs")
        
        if len(logs) > 0:
            log = logs[0]
            # Verify log structure
            assert "id" in log
            assert "usuario_id" in log
            assert "usuario_nombre" in log
            assert "modulo" in log
            assert "accion" in log
            assert "fecha" in log
            print("✓ Audit log structure is correct")
    
    def test_auditoria_filter_by_modulo(self, auth_headers):
        """Test filtering audit logs by modulo"""
        # Filter by presupuestos
        response = requests.get(f"{BASE_URL}/api/admin/auditoria?modulo=presupuestos", headers=auth_headers)
        assert response.status_code == 200
        logs = response.json()
        
        for log in logs:
            assert log["modulo"] == "presupuestos"
        print(f"✓ Auditoria filter by modulo=presupuestos returns {len(logs)} logs")
        
        # Filter by empresas
        response = requests.get(f"{BASE_URL}/api/admin/auditoria?modulo=empresas", headers=auth_headers)
        assert response.status_code == 200
        logs = response.json()
        
        for log in logs:
            assert log["modulo"] == "empresas"
        print(f"✓ Auditoria filter by modulo=empresas returns {len(logs)} logs")
    
    def test_auditoria_limit_parameter(self, auth_headers):
        """Test limit parameter for audit logs"""
        response = requests.get(f"{BASE_URL}/api/admin/auditoria?limit=5", headers=auth_headers)
        assert response.status_code == 200
        logs = response.json()
        assert len(logs) <= 5
        print(f"✓ Auditoria limit parameter works (returned {len(logs)} logs)")


class TestProveedorStatsEndpoint(TestSetup):
    """Test GET /api/admin/estadisticas/proveedores endpoint"""
    
    def test_get_proveedor_stats(self, auth_headers):
        """Test fetching proveedor payment statistics"""
        response = requests.get(f"{BASE_URL}/api/admin/estadisticas/proveedores", headers=auth_headers)
        assert response.status_code == 200
        stats = response.json()
        assert isinstance(stats, list)
        print(f"✓ Proveedor stats endpoint returns {len(stats)} proveedores")
        
        if len(stats) > 0:
            prov = stats[0]
            # Verify structure
            assert "proveedor" in prov
            assert "moneda" in prov
            assert "monto_total" in prov
            assert "pagado_total" in prov
            assert "pendiente_total" in prov
            assert "presupuestos" in prov
            print("✓ Proveedor stats structure is correct")


class TestAuditLogging(TestSetup):
    """Test that actions are properly logged to audit trail"""
    
    def test_presupuesto_actions_logged(self, auth_headers):
        """Test that presupuesto actions are logged"""
        # Get initial audit count for presupuestos
        response = requests.get(f"{BASE_URL}/api/admin/auditoria?modulo=presupuestos&limit=100", headers=auth_headers)
        initial_logs = response.json()
        initial_count = len(initial_logs)
        
        # Create a test empresa first
        empresa_data = {
            "nombre": "TEST_Empresa_Audit_" + str(int(time.time())),
            "ruc": "12345678-9",
            "direccion": "Test Address",
            "telefono": "021-123456",
            "email": "test@audit.com",
            "contacto": "Test Contact",
            "notas": "Test notes"
        }
        response = requests.post(f"{BASE_URL}/api/admin/empresas", headers=auth_headers, json=empresa_data)
        assert response.status_code == 200
        empresa = response.json()
        empresa_id = empresa["id"]
        
        # Create a presupuesto
        presupuesto_data = {
            "empresa_id": empresa_id,
            "logo_tipo": "arandujar",
            "moneda": "PYG",
            "fecha": "2026-01-15",
            "validez_dias": 15,
            "items": [
                {
                    "descripcion": "Test Item for Audit",
                    "cantidad": 1,
                    "costo": 100000,
                    "margen": 30,
                    "precio_unitario": 130000,
                    "subtotal": 130000,
                    "observacion": ""
                }
            ],
            "observaciones": "Test presupuesto for audit logging",
            "condiciones": "Test conditions",
            "subtotal": 118182,
            "iva": 11818,
            "total": 130000
        }
        
        response = requests.post(f"{BASE_URL}/api/admin/presupuestos", headers=auth_headers, json=presupuesto_data)
        assert response.status_code == 200
        presupuesto = response.json()
        presupuesto_id = presupuesto["id"]
        print(f"✓ Created test presupuesto {presupuesto.get('numero')}")
        
        # Check audit log was created
        response = requests.get(f"{BASE_URL}/api/admin/auditoria?modulo=presupuestos&limit=100", headers=auth_headers)
        new_logs = response.json()
        
        # Find the log for our action
        create_log = next((l for l in new_logs if l["accion"] == "crear" and presupuesto_id in l.get("entidad_id", "")), None)
        assert create_log is not None, "Presupuesto creation should be logged"
        print("✓ Presupuesto creation logged to audit trail")
        
        # Update costos and check logging
        costos_data = {
            "items": [{"descripcion": "Test", "cantidad": 1, "costo_estimado": 100000, "costo_real": 95000, "observacion": "", "proveedor": "Test", "es_nuevo": False}],
            "total_costos": 95000,
            "total_facturado": 130000,
            "ganancia": 35000,
            "proveedores_pagos": []
        }
        response = requests.put(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/costos", headers=auth_headers, json=costos_data)
        assert response.status_code == 200
        
        # Check audit log for costos update
        response = requests.get(f"{BASE_URL}/api/admin/auditoria?modulo=presupuestos&limit=100", headers=auth_headers)
        logs_after_costos = response.json()
        costos_log = next((l for l in logs_after_costos if l["accion"] == "actualizar_costos" and presupuesto_id in l.get("entidad_id", "")), None)
        assert costos_log is not None, "Costos update should be logged"
        print("✓ Costos update logged to audit trail")
        
        # Cleanup - delete presupuesto and empresa
        requests.delete(f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}", headers=auth_headers)
        requests.delete(f"{BASE_URL}/api/admin/empresas/{empresa_id}", headers=auth_headers)
        print("✓ Cleanup completed")


class TestCostosRealesModel(TestSetup):
    """Test CostosReales model validation"""
    
    def test_costos_model_accepts_all_fields(self, auth_headers):
        """Test that the CostosReales model accepts all new fields"""
        response = requests.get(f"{BASE_URL}/api/admin/presupuestos", headers=auth_headers)
        presupuestos = response.json()
        
        if len(presupuestos) == 0:
            pytest.skip("No presupuestos available")
        
        presupuesto_id = presupuestos[0]["id"]
        
        # Full model with all fields
        full_costos = {
            "items": [
                {
                    "descripcion": "Item completo",
                    "cantidad": 2.5,  # Float quantity
                    "costo_estimado": 100000,
                    "costo_real": 95000,
                    "observacion": "Test observation",
                    "proveedor": "Proveedor Completo",
                    "es_nuevo": False
                },
                {
                    "descripcion": "Item nuevo manual",
                    "cantidad": 1,
                    "costo_estimado": 0,
                    "costo_real": 50000,
                    "observacion": "",
                    "proveedor": "",  # Empty proveedor (Gastos Comunes)
                    "es_nuevo": True
                }
            ],
            "total_costos": 287500,
            "total_facturado": 400000,
            "ganancia": 112500,
            "proveedores_pagos": [
                {
                    "proveedor": "Proveedor Completo",
                    "monto_total": 237500,
                    "pagado": True,
                    "fecha_pago": "2026-01-15"
                },
                {
                    "proveedor": "Gastos Comunes",
                    "monto_total": 50000,
                    "pagado": False,
                    "fecha_pago": None
                }
            ]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/admin/presupuestos/{presupuesto_id}/costos",
            headers=auth_headers,
            json=full_costos
        )
        assert response.status_code == 200, f"Model validation failed: {response.text}"
        print("✓ CostosReales model accepts all fields correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
