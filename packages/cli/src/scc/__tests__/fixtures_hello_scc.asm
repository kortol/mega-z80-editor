;	Small C z80;
;	Coder (2.4,86/11/14)
;	Front End (2.7,84/11/28)
	.globl	.gchar,.gint,.pchar,.pint,.bool
	.globl	.sxt
	.globl	.or,.and,.xor
	.globl	.eq,.ne,.gt,.le,.ge,.lt,.uge,.ult,.ugt,.ule
	.globl	.asr,.asl
	.globl	.sub,.neg,.com,.lneg,.mul,.div
	.globl	.case
	.module	hello.i
	.area	_CODE
in8255:
	push	bc
	ld	hl,#0	;-2(ix)
	add	hl,sp
	push	hl
	ld	hl,#4096
	pop	de
	call	.pint
.2:
	ld	hl,#0	;-2(ix)
	add	hl,sp
	call	.gint
	push	hl
	ld	hl,#0
	pop	de
	call	.gt
	ld	a,h
	or	l
	j	nz,.4
	j	.5
.3:
	ld	hl,#0	;-2(ix)
	add	hl,sp
	push	hl
	call	.gint
	dec	hl
	pop	de
	call	.pint
	j	.2
.4:
	j	.3
.5:
	ld	a,#0xbd
	ld	bc,#0x3
	out	(c),a
	ld	a,#0x05
	ld	bc,#0x3
	out	(c),a
	ld	a,#0x09
	ld	bc,#0x3
	out	(c),a
.1:
	pop	bc
	ret
outchar:
loop:
	ld	bc,#0x2
	in	a,(c)
	bit	6,a
	jr	nz,loop
	bit	1,a
	jr	z,loop
	ld	hl,#2	;2(ix)
	add	hl,sp
	call	.gint
	ld	a,l
	ld	bc,#0x1
	out	(c),a
	ld	bc,#0x2000
	in	a,(c)
.6:
	ret
outstr:
.8:
	ld	hl,#2	;2(ix)
	add	hl,sp
	call	.gint
	call	.gchar
	ld	a,h
	or	l
	j	z,.9
	ld	hl,#2	;2(ix)
	add	hl,sp
	call	.gint
	call	.gchar
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ld	hl,#2	;2(ix)
	add	hl,sp
	push	hl
	call	.gint
	inc	hl
	pop	de
	call	.pint
	j	.8
.9:
.7:
	ret
main:
	dec	sp
	ld	a,#0
	call	in8255
	ld	hl,#.0+0
	push	hl
	ld	a,#1
	call	outstr
	pop	bc
	ld	hl,#0	;-1(ix)
	add	hl,sp
	push	hl
	ld	hl,#48
	pop	de
	call	.pchar
.11:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	hl,#57
	pop	de
	call	.le
	ld	a,h
	or	l
	j	nz,.13
	j	.14
.12:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	push	hl
	call	.gchar
	inc	hl
	pop	de
	call	.pchar
	j	.11
.13:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	j	.12
.14:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	push	hl
	ld	hl,#65
	pop	de
	call	.pchar
.15:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	hl,#90
	pop	de
	call	.le
	ld	a,h
	or	l
	j	nz,.17
	j	.18
.16:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	push	hl
	call	.gchar
	inc	hl
	pop	de
	call	.pchar
	j	.15
.17:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	j	.16
.18:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	push	hl
	ld	hl,#97
	pop	de
	call	.pchar
.19:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	hl,#122
	pop	de
	call	.le
	ld	a,h
	or	l
	j	nz,.21
	j	.22
.20:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	push	hl
	call	.gchar
	inc	hl
	pop	de
	call	.pchar
	j	.19
.21:
	ld	hl,#0	;-1(ix)
	add	hl,sp
	call	.gchar
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	j	.20
.22:
	ld	hl,#.0+33
	push	hl
	ld	a,#1
	call	outstr
	pop	bc
.10:
	inc	sp
	ret
	.area	_DATA
.0:	.db	90,56,48,32,83,109,97,108
	.db	108,32,67,32,100,101,118,101
	.db	108,111,112,109,101,110,116,32
	.db	115,121,115,116,101,109,13,10
	.db	0,13,10,0
	.area	_BSS
	.globl	etext
	.globl	edata
	.globl	in8255
	.globl	outchar
	.globl	outstr
	.globl	main

;0 error(s) in compilation
;	literal pool:36
;	global pool:84
;	Macro pool:36
