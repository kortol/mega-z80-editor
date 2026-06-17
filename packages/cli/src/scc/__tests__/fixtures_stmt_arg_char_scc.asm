	.globl	outchar
	.globl	main
	.module	stmt_arg_char.i
	.area	_CODE
main:
	ld	hl,#65
	push	hl
	call	echo
	pop	bc
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
echo:
	ld	hl,#2
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	ret
	.area	_BSS
