; translated from SCC module fixtures_hello_scc.asm
        PUBLIC in8255
        PUBLIC outchar
        PUBLIC outstr
        PUBLIC main
        EXTERN .and
        EXTERN .asl
        EXTERN .asr
        EXTERN .bool
        EXTERN .case
        EXTERN .com
        EXTERN .div
        EXTERN .eq
        EXTERN .gchar
        EXTERN .ge
        EXTERN .gint
        EXTERN .gt
        EXTERN .le
        EXTERN .lneg
        EXTERN .lt
        EXTERN .mul
        EXTERN .ne
        EXTERN .neg
        EXTERN .or
        EXTERN .pchar
        EXTERN .pint
        EXTERN .sub
        EXTERN .sxt
        EXTERN .uge
        EXTERN .ugt
        EXTERN .ule
        EXTERN .ult
        EXTERN .xor
        EXTERN edata
        EXTERN etext
;	Small C z80;
;	Coder (2.4,86/11/14)
;	Front End (2.7,84/11/28)
        SECTION TEXT
in8255:
	push	bc
	ld	hl,0	 ;-2(ix)
	add	hl,sp
	push	hl
	ld	hl,4096
	pop	de
	call	.pint
__scc_local_2:
	ld	hl,0	 ;-2(ix)
	add	hl,sp
	call	.gint
	push	hl
	ld	hl,0
	pop	de
	call	.gt
	ld	a,h
	or	l
        JP	nz,__scc_local_4
        JP	__scc_local_5
__scc_local_3:
	ld	hl,0	 ;-2(ix)
	add	hl,sp
	push	hl
	call	.gint
	dec	hl
	pop	de
	call	.pint
        JP	__scc_local_2
__scc_local_4:
        JP	__scc_local_3
__scc_local_5:
	ld	a,0xbd
	ld	bc,0x3
	out	(c),a
	ld	a,0x05
	ld	bc,0x3
	out	(c),a
	ld	a,0x09
	ld	bc,0x3
	out	(c),a
__scc_local_1:
	pop	bc
	ret
outchar:
loop:
	ld	bc,0x2
	in	a,(c)
	bit	6,a
	jr	nz,loop
	bit	1,a
	jr	z,loop
	ld	hl,2	 ;2(ix)
	add	hl,sp
	call	.gint
	ld	a,l
	ld	bc,0x1
	out	(c),a
	ld	bc,0x2000
	in	a,(c)
__scc_local_6:
	ret
outstr:
__scc_local_8:
	ld	hl,2	 ;2(ix)
	add	hl,sp
	call	.gint
	call	.gchar
	ld	a,h
	or	l
        JP	z,__scc_local_9
	ld	hl,2	 ;2(ix)
	add	hl,sp
	call	.gint
	call	.gchar
	push	hl
	ld	a,1
	call	outchar
	pop	bc
	ld	hl,2	 ;2(ix)
	add	hl,sp
	push	hl
	call	.gint
	inc	hl
	pop	de
	call	.pint
        JP	__scc_local_8
__scc_local_9:
__scc_local_7:
	ret
main:
	dec	sp
	ld	a,0
	call	in8255
	ld	hl,__scc_local_0+0
	push	hl
	ld	a,1
	call	outstr
	pop	bc
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	push	hl
	ld	hl,48
	pop	de
	call	.pchar
__scc_local_11:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	hl,57
	pop	de
	call	.le
	ld	a,h
	or	l
        JP	nz,__scc_local_13
        JP	__scc_local_14
__scc_local_12:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	push	hl
	call	.gchar
	inc	hl
	pop	de
	call	.pchar
        JP	__scc_local_11
__scc_local_13:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	a,1
	call	outchar
	pop	bc
        JP	__scc_local_12
__scc_local_14:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	push	hl
	ld	hl,65
	pop	de
	call	.pchar
__scc_local_15:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	hl,90
	pop	de
	call	.le
	ld	a,h
	or	l
        JP	nz,__scc_local_17
        JP	__scc_local_18
__scc_local_16:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	push	hl
	call	.gchar
	inc	hl
	pop	de
	call	.pchar
        JP	__scc_local_15
__scc_local_17:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	a,1
	call	outchar
	pop	bc
        JP	__scc_local_16
__scc_local_18:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	push	hl
	ld	hl,97
	pop	de
	call	.pchar
__scc_local_19:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	hl,122
	pop	de
	call	.le
	ld	a,h
	or	l
        JP	nz,__scc_local_21
        JP	__scc_local_22
__scc_local_20:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	push	hl
	call	.gchar
	inc	hl
	pop	de
	call	.pchar
        JP	__scc_local_19
__scc_local_21:
	ld	hl,0	 ;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	a,1
	call	outchar
	pop	bc
        JP	__scc_local_20
__scc_local_22:
	ld	hl,__scc_local_0+33
	push	hl
	ld	a,1
	call	outstr
	pop	bc
__scc_local_10:
	inc	sp
	ret
        SECTION DATA
__scc_local_0:         DB 90,56,48,32,83,109,97,108
        DB 108,32,67,32,100,101,118,101
        DB 108,111,112,109,101,110,116,32
        DB 115,121,115,116,101,109,13,10
        DB 0,13,10,0
        SECTION BSS

;0 error(s) in compilation
;	literal pool:36
;	global pool:84
;	Macro pool:36
