	.globl	.eq
	.globl	outchar
	.globl	main
	.module	stmt_eq_helper.i
	.area	_CODE
main:
	ld	hl,#81
	push	hl
	ld	hl,#81
	pop	de
	call	.eq
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#69
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
	.area	_BSS
