; Bucle simple del PDF (Tecnicas SW para explotar ILP)
;   for (i=1; i<=1000; i++)  x(i) = x(i) + s;
;
; Codigo del PDF:
;   Loop: LD   F0,0(R1)
;         ADDD F4,F0,F2
;         SD   0(R1),F4
;         SUBI R1,R1,#8
;         BNEZ R1,Loop
;
; Nota: el simulador acepta l.d/add.d/s.d (normaliza a LD/ADDD/SD) y
; tambien SUBI(=DADDI entero) y BNEZ. Se usa r1 con un valor virtual.

        .data
X:      .word 8

        .text
Loop:   l.d f0,X(r1)        ; LD  F0,0(R1)
        add.d f4,f0,f2      ; ADDD F4,F0,F2  (RAW con LD)
        s.d f4,X(r1)        ; SD  0(R1),F4   (RAW con ADDD)
        daddi r1,r1,-8      ; SUBI R1,R1,#8
        bnez r1,Loop        ; BNEZ R1,Loop
        halt