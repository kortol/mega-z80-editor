	.globl	.ne
	.globl	outchar
	.globl	main
	.module	stmt_arg_ne_helper.i
	.area	_CODE
main:
	ld	hl,#66
	push	hl
	call	check
	pop	bc
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#78
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
check:
	ld	hl,#2
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	hl,#65
	pop	de
	call	.ne
	ret
	.area	_BSS
