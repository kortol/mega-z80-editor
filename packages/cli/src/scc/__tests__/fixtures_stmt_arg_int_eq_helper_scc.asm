	.globl	.eq
	.globl	outchar
	.globl	main
	.module	stmt_arg_int_eq_helper.i
	.area	_CODE
main:
	ld	hl,#90
	push	hl
	call	check16
	pop	bc
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#73
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	jp	.3
.2:
	ld	hl,#88
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
.3:
	ret
check16:
	ld	hl,#2
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	push	hl
	ld	hl,#90
	pop	de
	call	.eq
	ret
	.area	_BSS
