	.globl	.eq
	.globl	outchar
	.globl	main
	.module	stmt_local_int_arg_int_eq_helper.i
	.area	_CODE
main:
	ld	hl,#90
	push	hl
	call	checkmix
	pop	bc
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#81
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
.2:
	ld	hl,#88
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
checkmix:
	dec	sp
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#90
	inc	hl
	ld	(hl),#0
	ld	hl,#4
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	push	hl
	ld	hl,#2
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	pop	de
	call	.eq
	inc	sp
	inc	sp
	ret
	.area	_BSS
