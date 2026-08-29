; Ejemplo canonico de Tomasulo (Hennessy & Patterson / PDF Arquitectura 2020)
; Secuencia original del PDF:
;   LD   F6, 34+(R2)
;   LD   F2, 45+(R3)
;   MULT F0, F2, F4
;   SUBD F8, F6, F2
;   DIVD F10, F0, F6
;   ADDD F6, F8, F2
;
; Latencias del PDF: LD=2, ADD/SUB=2, MULT=10, DIV=40 ciclos
; (ajustar en el menu Configure -> Architecture Cycle dentro del simulador)
;
; Nota: este simulador usa memoria virtual con valores aleatorios,
; por lo que los valores numericos no coinciden con el PDF, pero
; el ORDEN de issue/ejecucion/escritura y las dependencias si.

        .data
V34:    .word 34
V45:    .word 45
F4val:  .word 7

        .text
main:   l.d f6,V34(r0)      ; S1: LD  F6
        l.d f2,V45(r0)      ; S2: LD  F2
        mul.d f0,f2,f4      ; S3: MULT F0 = F2 * F4   (depende de S2)
        sub.d f8,f6,f2      ; S4: SUBD F8 = F6 - F2   (depende de S1 y S2)
        div.d f10,f0,f6     ; S5: DIVD F10 = F0 / F6  (depende de S3 y S1)
        add.d f6,f8,f2      ; S6: ADDD F6 = F8 + F2   (depende de S4; renombra F6)
        halt