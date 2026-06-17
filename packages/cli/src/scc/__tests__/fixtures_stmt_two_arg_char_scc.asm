	.globl	outchar
	.globl	main
	.module	stmt_two_arg_char.i
	.area	_CODE
main:
	ld	hl,#65
	push	hl
	ld	hl,#66
	push	hl
	call	pickfirst
	pop	bc
	pop	bc
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
pickfirst:
	ld	hl,#4
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	ret
	.area	_BSS
