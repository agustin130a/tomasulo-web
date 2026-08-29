; Desenrollado de bucle 4 veces del PDF (renombrado por el compilador)
; Expone mas paralelismo y elimina 3 saltos y 3 decrementos.
;
; Codigo del PDF:
;   Loop: LD   F0,0(R1)   / ADDD F4,F0,F2   / SD 0(R1),F4
;         LD   F6,-8(R1)  / ADDD F8,F6,F2   / SD -8(R1),F8
;         LD   F10,-16(R1)/ ADDD F12,F10,F2 / SD -16(R1),F12
;         LD   F14,-24(R1)/ ADDD F16,F14,F2 / SD -24(R1),F16
;         SUBI R1,R1,#32
;         BNEZ R1,Loop
;
; Observa como F0/F4, F6/F8, F10/F12, F14/F16 usan registros distintos:
; ese es el "renombrado por el compilador" que evita dependencias de nombre.

        .data
X:      .word 8

        .text
Loop:   l.d f0,X(r1)
        add.d f4,f0,f2
        s.d f4,X(r1)
        l.d f6,X(r1)
        add.d f8,f6,f2
        s.d f8,X(r1)
        l.d f10,X(r1)
        add.d f12,f10,f2
        s.d f12,X(r1)
        l.d f14,X(r1)
        add.d f16,f14,f2
        s.d f16,X(r1)
        daddi r1,r1,-32
        bnez r1,Loop
        halt