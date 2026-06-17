	.globl	outchar
	.globl	main
	.module	stmt_arg_int.i
	.area	_CODE
main:
	ld	hl,#90
	push	hl
	call	echo16
	pop	bc
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
echo16:
	ld	hl,#2
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ret
	.area	_BSS
