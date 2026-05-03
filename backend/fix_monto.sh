def to_pyg(monto, moneda, tipo_cambio):
    if moneda == "PYG" or not moneda:
        return monto
    tc = tipo_cambio or 1.0          # ← acá está el problema
    return monto * tc
